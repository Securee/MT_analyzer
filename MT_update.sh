#!/bin/bash
cd /home/lzy/tools/mariana-trench
export MT_INSTALL_DIRECTORY="$PWD/install"
export CMAKE_PREFIX_PATH=/home/linuxbrew/.linuxbrew/opt/jsoncpp:/home/linuxbrew/.linuxbrew/opt/zlib
cd /home/lzy/tools/mariana-trench/redex
git pull
cd /home/lzy/tools/mariana-trench/redex/build
make -j4
make install
cd /home/lzy/tools/mariana-trench
git pull
cd /home/lzy/tools/mariana-trench/build
make -j4
make install
cd ..
python3 scripts/setup.py \
  --binary "$MT_INSTALL_DIRECTORY/bin/mariana-trench-binary" \
  --pyredex "$MT_INSTALL_DIRECTORY/bin/pyredex" \
  install
