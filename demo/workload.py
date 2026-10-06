"""Demo application: one TCP connection whose behaviour changes mid-flow.

Phases: bulk transfer -> sparse interactive messages -> bulk transfer.
It is ordinary socket code; ACCC is injected only via LD_PRELOAD.
"""

import socket
import sys
import time

PHASES = [("bulk", 3.0), ("interactive", 3.0), ("bulk", 3.0)]


def main(host: str, port: int) -> None:
    s = socket.create_connection((host, port))
    chunk = b"x" * 65536
    sent = 0
    for name, dur in PHASES:
        print(f"PHASE {name} {time.monotonic():.3f}", flush=True)
        end = time.monotonic() + dur
        while time.monotonic() < end:
            if name == "bulk":
                sent += s.send(chunk)
                time.sleep(0.0005)  # pace a little so loopback isn't unbounded
            else:
                s.sendall(b"r" * 200)
                sent += 200
                time.sleep(0.15)
    cc = s.getsockopt(socket.IPPROTO_TCP, socket.TCP_CONGESTION, 16).rstrip(b"\0").decode()
    print(f"DONE sent={sent} final_cc={cc}", flush=True)
    s.shutdown(socket.SHUT_WR)
    s.recv(1)
    s.close()


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]))
