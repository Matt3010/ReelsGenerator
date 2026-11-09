# The API: Node + ffmpeg, with llama.cpp (the story) and stable-diffusion.cpp (the pictures) built for the GPU.

# --- llama-server and sd-cli, compiled for the GTX 1060 (Pascal, compute 6.1) ----------------------------
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04 AS engines
RUN apt-get update && apt-get install -y --no-install-recommends git cmake build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ARG CUDA_ARCH=61
ARG LLAMA_TAG=b12210
ARG SD_TAG=master-1068-fc350be
# the CUDA driver comes from the host at run time: link against the stub
ENV LIBRARY_PATH=/usr/local/cuda/lib64/stubs
RUN git clone --depth 1 --branch ${LLAMA_TAG} https://github.com/ggml-org/llama.cpp /src/llama \
 && cmake -S /src/llama -B /src/llama/build -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=${CUDA_ARCH} \
      -DGGML_NATIVE=OFF -DBUILD_SHARED_LIBS=OFF -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF \
      -DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined \
 && cmake --build /src/llama/build --target llama-server -j"$(nproc)" \
 && install -D /src/llama/build/bin/llama-server /opt/engines/llama-server
RUN git clone --depth 1 --branch ${SD_TAG} --recursive https://github.com/leejet/stable-diffusion.cpp /src/sd \
 && cmake -S /src/sd -B /src/sd/build -DCMAKE_BUILD_TYPE=Release -DSD_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=${CUDA_ARCH} \
      -DGGML_NATIVE=OFF -DBUILD_SHARED_LIBS=OFF -DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined \
 && cmake --build /src/sd/build --target sd-cli -j"$(nproc)" \
 && install -D "$(find /src/sd/build -type f -name sd-cli | head -1)" /opt/engines/sd-cli

# --- the Node dependencies (native ones built for Linux) -------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# --- run --------------------------------------------------------------------------------------------------
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04
ENV DEBIAN_FRONTEND=noninteractive
# ffmpeg with libass for the captions; Arial Black, the captions' font, from Microsoft's core fonts
RUN echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
 && apt-get update && apt-get install -y --no-install-recommends ffmpeg fontconfig ttf-mscorefonts-installer ca-certificates libgomp1 \
 && fc-cache -f && rm -rf /var/lib/apt/lists/*
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=engines /opt/engines /opt/engines
WORKDIR /app/backend
COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json backend/tsconfig.json ./
COPY backend/src ./src
COPY backend/drizzle ./drizzle
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
    MODELS_DIR=/models DATA_DIR=/data \
    LLAMA_SERVER=/opt/engines/llama-server SD_CLI=/opt/engines/sd-cli
RUN useradd --uid 1001 --create-home shorts && mkdir -p /models /data && chown shorts /models /data
USER shorts
EXPOSE 3000
# the models first (downloaded once into the volume, skipped when present), then the API
CMD ["sh", "-c", "node node_modules/tsx/dist/cli.mjs src/setup.ts && exec node node_modules/tsx/dist/cli.mjs src/server.ts"]
