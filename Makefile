NAME = deepseek-sidebar
DIST = dist
OUT ?= $(HOME)/chrome/$(NAME)

up: build install

build:
	bun ./build.ts

install:
	@mkdir -p "$(OUT)"
	@rsync -a --delete "$(DIST)/" "$(OUT)/"
	@echo "已输出到 $(OUT)，在 chrome://extensions 加载该目录"

zip: build
	@cd "$(DIST)" && zip -qrFS "../$(NAME).zip" .
	@echo "已打包 $(NAME).zip"
