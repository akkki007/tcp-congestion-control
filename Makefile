PYTHON ?= python3

all: shim

shim:
	$(MAKE) -C shim

test: shim
	$(PYTHON) -m pytest -q

demo: shim
	$(PYTHON) -m demo.live_switch

backend:
	$(PYTHON) -m demo.server

dashboard:
	cd dashboard && bun install && bun run dev

clean:
	$(MAKE) -C shim clean

.PHONY: all shim test demo backend dashboard clean
