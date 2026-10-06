/*
 * libaccc.so -- ACCC LD_PRELOAD actuator shim (Fig. 1, refs. 106/107).
 *
 * Loaded into an unmodified application with LD_PRELOAD. It:
 *   - tracks the application's TCP sockets (socket/connect/accept/close hooks),
 *   - registers each connected socket with the ACCC daemon over a unix socket,
 *   - samples TCP_INFO for every tracked socket on a fixed interval and streams
 *     it to the daemon (portable telemetry path, no eBPF required),
 *   - executes setsockopt(TCP_CONGESTION) when the daemon asks it to switch a
 *     socket's congestion control algorithm mid-flow.
 *
 * Fails open: if the daemon is not running the application behaves normally.
 *
 * Environment:
 *   ACCC_SOCK         daemon socket path        (default /run/accc.sock)
 *   ACCC_INTERVAL_MS  telemetry interval in ms  (default 50)
 *   ACCC_DEBUG        print diagnostics to stderr when set
 */
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <dlfcn.h>
#include <errno.h>
#include <linux/tcp.h>
#include <netinet/in.h>
#include <poll.h>
#include <pthread.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>

#define MAX_FDS 65536
#define LINE_MAX_LEN 1024
#define RECONNECT_S 1.0
#ifndef TCP_CA_NAME_MAX
#define TCP_CA_NAME_MAX 16
#endif

enum fd_state { FD_NONE = 0, FD_TCP = 1, FD_REGISTERED = 2 };

static int (*real_socket)(int, int, int);
static int (*real_connect)(int, const struct sockaddr *, socklen_t);
static int (*real_accept)(int, struct sockaddr *, socklen_t *);
static int (*real_accept4)(int, struct sockaddr *, socklen_t *, int);
static int (*real_close)(int);

static unsigned char fd_table[MAX_FDS];
static pthread_mutex_t fd_lock = PTHREAD_MUTEX_INITIALIZER;   /* fd_table + setsockopt */
static pthread_mutex_t ctl_lock = PTHREAD_MUTEX_INITIALIZER;  /* ctl_fd + writes */
static int ctl_fd = -1;
static double ctl_retry_at;
static pthread_t worker;
static int worker_started;
static pthread_mutex_t worker_lock = PTHREAD_MUTEX_INITIALIZER;

static char sock_path[sizeof(((struct sockaddr_un *)0)->sun_path)] = "/run/accc.sock";
static int interval_ms = 50;
static int debug;

static void dbg(const char *fmt, ...) {
    if (!debug) return;
    va_list ap;
    va_start(ap, fmt);
    fprintf(stderr, "[libaccc %d] ", getpid());
    vfprintf(stderr, fmt, ap);
    fputc('\n', stderr);
    va_end(ap);
}

static double now_s(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec + ts.tv_nsec / 1e9;
}

static void resolve(void) {
    if (real_socket) return;
    real_socket = dlsym(RTLD_NEXT, "socket");
    real_connect = dlsym(RTLD_NEXT, "connect");
    real_accept = dlsym(RTLD_NEXT, "accept");
    real_accept4 = dlsym(RTLD_NEXT, "accept4");
    real_close = dlsym(RTLD_NEXT, "close");
}

/* ---- control channel ---------------------------------------------------- */

/* Caller holds ctl_lock. */
static void ctl_drop_locked(void) {
    if (ctl_fd >= 0) real_close(ctl_fd);
    ctl_fd = -1;
    ctl_retry_at = now_s() + RECONNECT_S;
}

/* Caller holds ctl_lock. Returns 0 when connected. */
static int ctl_ensure_locked(void) {
    if (ctl_fd >= 0) return 0;
    if (now_s() < ctl_retry_at) return -1;
    int fd = real_socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
    if (fd < 0) return -1;
    struct sockaddr_un sa = {.sun_family = AF_UNIX};
    memcpy(sa.sun_path, sock_path, sizeof(sa.sun_path) - 1);
    if (real_connect(fd, (struct sockaddr *)&sa, sizeof(sa)) < 0) {
        real_close(fd);
        ctl_retry_at = now_s() + RECONNECT_S;
        return -1;
    }
    struct timeval tv = {.tv_sec = 0, .tv_usec = 100000};
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
    ctl_fd = fd;
    dbg("connected to %s", sock_path);
    return 0;
}

static int ctl_send(const char *line, size_t len) {
    int rc = -1;
    pthread_mutex_lock(&ctl_lock);
    if (ctl_ensure_locked() == 0) {
        size_t off = 0;
        while (off < len) {
            ssize_t n = send(ctl_fd, line + off, len - off, MSG_NOSIGNAL);
            if (n < 0 && errno == EINTR) continue;
            if (n <= 0) break;
            off += (size_t)n;
        }
        if (off == len) rc = 0;
        else ctl_drop_locked(); /* never leave a half-written line on the stream */
    }
    pthread_mutex_unlock(&ctl_lock);
    return rc;
}

static int ctl_sendf(const char *fmt, ...) {
    char buf[LINE_MAX_LEN];
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    if (n <= 0 || n >= (int)sizeof(buf)) return -1;
    return ctl_send(buf, (size_t)n);
}

/* ---- socket helpers ----------------------------------------------------- */

static void fmt_addr(const struct sockaddr_storage *ss, char *out, size_t outlen) {
    char ip[INET6_ADDRSTRLEN] = "?";
    int port = 0;
    if (ss->ss_family == AF_INET) {
        const struct sockaddr_in *s = (const struct sockaddr_in *)ss;
        inet_ntop(AF_INET, &s->sin_addr, ip, sizeof(ip));
        port = ntohs(s->sin_port);
        snprintf(out, outlen, "%s:%d", ip, port);
    } else if (ss->ss_family == AF_INET6) {
        const struct sockaddr_in6 *s = (const struct sockaddr_in6 *)ss;
        inet_ntop(AF_INET6, &s->sin6_addr, ip, sizeof(ip));
        port = ntohs(s->sin6_port);
        snprintf(out, outlen, "[%s]:%d", ip, port);
    } else {
        snprintf(out, outlen, "?");
    }
}

static int is_tcp_socket(int fd) {
    int type = 0, domain = 0;
    socklen_t l = sizeof(type);
    if (getsockopt(fd, SOL_SOCKET, SO_TYPE, &type, &l) < 0 || type != SOCK_STREAM) return 0;
    l = sizeof(domain);
    if (getsockopt(fd, SOL_SOCKET, SO_DOMAIN, &domain, &l) < 0) return 0;
    return domain == AF_INET || domain == AF_INET6;
}

static void get_cc(int fd, char *out, size_t outlen) {
    socklen_t l = (socklen_t)outlen;
    out[0] = '\0';
    if (getsockopt(fd, IPPROTO_TCP, TCP_CONGESTION, out, &l) < 0) snprintf(out, outlen, "?");
    out[outlen - 1] = '\0';
}

static void *worker_main(void *arg);

static void start_worker(void) {
    pthread_mutex_lock(&worker_lock);
    if (!worker_started) {
        pthread_attr_t attr;
        pthread_attr_init(&attr);
        pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
        if (pthread_create(&worker, &attr, worker_main, NULL) == 0) worker_started = 1;
        pthread_attr_destroy(&attr);
    }
    pthread_mutex_unlock(&worker_lock);
}

static void register_fd(int fd, const struct sockaddr *peer_hint, socklen_t peer_len) {
    if (fd < 0 || fd >= MAX_FDS) return;
    struct sockaddr_storage local = {0}, peer = {0};
    socklen_t l = sizeof(local);
    getsockname(fd, (struct sockaddr *)&local, &l);
    l = sizeof(peer);
    if (getpeername(fd, (struct sockaddr *)&peer, &l) < 0 && peer_hint &&
        peer_len <= sizeof(peer))
        memcpy(&peer, peer_hint, peer_len);
    char src[64], dst[64], cc[TCP_CA_NAME_MAX];
    fmt_addr(&local, src, sizeof(src));
    fmt_addr(&peer, dst, sizeof(dst));
    get_cc(fd, cc, sizeof(cc));

    pthread_mutex_lock(&fd_lock);
    fd_table[fd] = FD_REGISTERED;
    pthread_mutex_unlock(&fd_lock);

    start_worker();
    ctl_sendf("{\"t\":\"reg\",\"pid\":%d,\"fd\":%d,\"src\":\"%s\",\"dst\":\"%s\",\"cc\":\"%s\"}\n",
              getpid(), fd, src, dst, cc);
    dbg("registered fd=%d %s -> %s cc=%s", fd, src, dst, cc);
}

/* ---- interposed libc functions ----------------------------------------- */

int socket(int domain, int type, int protocol) {
    resolve();
    int fd = real_socket(domain, type, protocol);
    if (fd >= 0 && fd < MAX_FDS && (domain == AF_INET || domain == AF_INET6) &&
        (type & 0xf) == SOCK_STREAM) {
        pthread_mutex_lock(&fd_lock);
        fd_table[fd] = FD_TCP;
        pthread_mutex_unlock(&fd_lock);
    }
    return fd;
}

int connect(int fd, const struct sockaddr *addr, socklen_t len) {
    resolve();
    int rc = real_connect(fd, addr, len);
    int saved = errno;
    if ((rc == 0 || errno == EINPROGRESS) && fd >= 0 && fd < MAX_FDS) {
        pthread_mutex_lock(&fd_lock);
        int st = fd_table[fd];
        pthread_mutex_unlock(&fd_lock);
        if (st == FD_TCP) register_fd(fd, addr, len);
    }
    errno = saved;
    return rc;
}

static int after_accept(int lfd, int fd) {
    int saved = errno;
    if (fd >= 0 && fd < MAX_FDS) {
        pthread_mutex_lock(&fd_lock);
        int listening_tcp = lfd >= 0 && lfd < MAX_FDS && fd_table[lfd] != FD_NONE;
        pthread_mutex_unlock(&fd_lock);
        if (listening_tcp || is_tcp_socket(fd)) register_fd(fd, NULL, 0);
    }
    errno = saved;
    return fd;
}

int accept(int lfd, struct sockaddr *addr, socklen_t *len) {
    resolve();
    return after_accept(lfd, real_accept(lfd, addr, len));
}

int accept4(int lfd, struct sockaddr *addr, socklen_t *len, int flags) {
    resolve();
    return after_accept(lfd, real_accept4(lfd, addr, len, flags));
}

int close(int fd) {
    resolve();
    if (fd >= 0 && fd < MAX_FDS) {
        pthread_mutex_lock(&fd_lock);
        int st = fd_table[fd];
        fd_table[fd] = FD_NONE;
        pthread_mutex_unlock(&fd_lock);
        if (st == FD_REGISTERED) ctl_sendf("{\"t\":\"unreg\",\"pid\":%d,\"fd\":%d}\n", getpid(), fd);
    }
    return real_close(fd);
}

/* ---- worker thread: telemetry + command execution ---------------------- */

static void sample_all(void) {
    static int fds[MAX_FDS];
    int n = 0;
    pthread_mutex_lock(&fd_lock);
    for (int fd = 0; fd < MAX_FDS; fd++)
        if (fd_table[fd] == FD_REGISTERED) fds[n++] = fd;
    pthread_mutex_unlock(&fd_lock);

    double ts = now_s();
    for (int i = 0; i < n; i++) {
        int fd = fds[i];
        struct tcp_info ti;
        socklen_t l = sizeof(ti);
        char cc[TCP_CA_NAME_MAX];
        memset(&ti, 0, sizeof(ti));
        /* Hold fd_lock so the fd cannot be closed and reused underneath us. */
        pthread_mutex_lock(&fd_lock);
        int ok = fd_table[fd] == FD_REGISTERED &&
                 getsockopt(fd, IPPROTO_TCP, TCP_INFO, &ti, &l) == 0;
        if (ok) get_cc(fd, cc, sizeof(cc));
        pthread_mutex_unlock(&fd_lock);
        if (!ok || ti.tcpi_state != 1 /* TCP_ESTABLISHED */) continue;
        ctl_sendf("{\"t\":\"tel\",\"pid\":%d,\"fd\":%d,\"ts\":%.6f,\"cc\":\"%s\","
                  "\"srtt_us\":%u,\"rttvar_us\":%u,\"min_rtt_us\":%u,\"snd_cwnd\":%u,"
                  "\"total_retrans\":%u,\"segs_out\":%u,\"bytes_acked\":%llu,"
                  "\"bytes_received\":%llu,\"delivery_rate\":%llu,\"app_limited\":%s,"
                  "\"last_data_sent_ms\":%u}\n",
                  getpid(), fd, ts, cc, ti.tcpi_rtt, ti.tcpi_rttvar, ti.tcpi_min_rtt,
                  ti.tcpi_snd_cwnd, ti.tcpi_total_retrans, ti.tcpi_segs_out,
                  (unsigned long long)ti.tcpi_bytes_acked,
                  (unsigned long long)ti.tcpi_bytes_received,
                  (unsigned long long)ti.tcpi_delivery_rate,
                  ti.tcpi_delivery_rate_app_limited ? "true" : "false",
                  ti.tcpi_last_data_sent);
    }
}

/* Parse {"t":"set","fd":N,"cc":"name"} without a JSON library. */
static int parse_set(const char *line, int *fd, char *cc, size_t cclen) {
    if (!strstr(line, "\"t\":\"set\"")) return -1;
    const char *p = strstr(line, "\"fd\":");
    const char *q = strstr(line, "\"cc\":\"");
    if (!p || !q) return -1;
    *fd = atoi(p + 5);
    q += 6;
    size_t i = 0;
    while (q[i] && q[i] != '"' && i + 1 < cclen) {
        char c = q[i];
        if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_')) return -1;
        cc[i] = c;
        i++;
    }
    if (q[i] != '"' || i == 0) return -1;
    cc[i] = '\0';
    return 0;
}

static void handle_line(const char *line) {
    int fd;
    char cc[TCP_CA_NAME_MAX];
    if (parse_set(line, &fd, cc, sizeof(cc)) < 0 || fd < 0 || fd >= MAX_FDS) return;
    int ok = 0, err = 0;
    pthread_mutex_lock(&fd_lock);
    if (fd_table[fd] == FD_REGISTERED) {
        ok = setsockopt(fd, IPPROTO_TCP, TCP_CONGESTION, cc, (socklen_t)strlen(cc)) == 0;
        if (!ok) err = errno;
    } else {
        err = EBADF;
    }
    pthread_mutex_unlock(&fd_lock);
    dbg("set fd=%d cc=%s -> %s", fd, cc, ok ? "ok" : strerror(err));
    ctl_sendf("{\"t\":\"ack\",\"pid\":%d,\"fd\":%d,\"cc\":\"%s\",\"ok\":%s,\"err\":%d}\n", getpid(),
              fd, cc, ok ? "true" : "false", err);
}

static void *worker_main(void *arg) {
    (void)arg;
    char buf[LINE_MAX_LEN * 4];
    size_t used = 0;
    double next = now_s();
    for (;;) {
        pthread_mutex_lock(&ctl_lock);
        int fd = ctl_fd;
        if (fd < 0 && ctl_ensure_locked() == 0) fd = ctl_fd;
        pthread_mutex_unlock(&ctl_lock);

        int timeout = (int)((next - now_s()) * 1000);
        if (timeout < 0) timeout = 0;
        if (fd >= 0) {
            struct pollfd pfd = {.fd = fd, .events = POLLIN};
            int pr = poll(&pfd, 1, timeout);
            if (pr > 0) {
                ssize_t n = recv(fd, buf + used, sizeof(buf) - used - 1, MSG_DONTWAIT);
                if (n <= 0 && !(n < 0 && (errno == EAGAIN || errno == EINTR))) {
                    pthread_mutex_lock(&ctl_lock);
                    if (ctl_fd == fd) ctl_drop_locked();
                    pthread_mutex_unlock(&ctl_lock);
                    used = 0;
                } else if (n > 0) {
                    used += (size_t)n;
                    buf[used] = '\0';
                    char *start = buf, *nl;
                    while ((nl = strchr(start, '\n'))) {
                        *nl = '\0';
                        handle_line(start);
                        start = nl + 1;
                    }
                    used -= (size_t)(start - buf);
                    memmove(buf, start, used);
                    if (used >= sizeof(buf) - 1) used = 0; /* oversized line: discard */
                }
            }
        } else {
            struct timespec ts = {.tv_sec = 0, .tv_nsec = (long)timeout * 1000000L};
            nanosleep(&ts, NULL);
        }
        if (now_s() >= next) {
            sample_all();
            next += interval_ms / 1000.0;
            if (next < now_s()) next = now_s() + interval_ms / 1000.0;
        }
    }
    return NULL;
}

/* ---- lifecycle ---------------------------------------------------------- */

static void atfork_child(void) {
    /* The child shares the parent's control connection and has no worker thread. */
    pthread_mutex_init(&fd_lock, NULL);
    pthread_mutex_init(&ctl_lock, NULL);
    pthread_mutex_init(&worker_lock, NULL);
    if (ctl_fd >= 0) real_close(ctl_fd);
    ctl_fd = -1;
    ctl_retry_at = 0;
    worker_started = 0;
    /* Inherited sockets stay owned by the parent's registration. */
    memset(fd_table, 0, sizeof(fd_table));
}

__attribute__((constructor)) static void accc_init(void) {
    resolve();
    const char *p = getenv("ACCC_SOCK");
    if (p && *p) snprintf(sock_path, sizeof(sock_path), "%s", p);
    const char *iv = getenv("ACCC_INTERVAL_MS");
    if (iv && atoi(iv) > 0) interval_ms = atoi(iv);
    debug = getenv("ACCC_DEBUG") != NULL;
    pthread_atfork(NULL, NULL, atfork_child);
    dbg("loaded, sock=%s interval=%dms", sock_path, interval_ms);
}
