PYTHON ?= python3

all: shim

shim:
	$(MAKE) -C shim

test: shim
	$(PYTHON) -m pytest -q

demo: shim
	$(PYTHON) -m demo.live_switch

clean:
	$(MAKE) -C shim clean

.PHONY: all shim test demo clean
