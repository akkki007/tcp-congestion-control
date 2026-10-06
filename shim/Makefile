CC ?= gcc
CFLAGS ?= -O2 -g -Wall -Wextra -Werror -fPIC
LDLIBS = -ldl -lpthread

libaccc.so: libaccc.c
	$(CC) $(CFLAGS) -shared -o $@ $< $(LDLIBS)

clean:
	rm -f libaccc.so

.PHONY: clean
