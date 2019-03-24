const Dockerator = require("./dockerator");

main().catch(error => {
  console.error(error);
  process.exit(1);
});

async function main() {
  // await runMongo();
  await runNodeos();
}

async function runMongo() {
  dock = new Dockerator({
    image: "mongo:4.0.6",
    printOutput: true,
    portMappings: ["27017:27017"]
  });
  await dock.setup();
  dock.loadExitHandler();
  await dock.start();
}

async function runNodeos() {
  dock = new Dockerator({
    image: "eosio/eos-dev:v1.5.2",
    command: [
      "bash",
      "-c",
      `nodeos -e -p eosio -d /mnt/dev/data \
      --config-dir /mnt/dev/config \
      --http-validate-host=false \
      --disable-replay-opts \
      --plugin eosio::producer_plugin \
      --plugin eosio::state_history_plugin \
      --plugin eosio::http_plugin \
      --plugin eosio::chain_api_plugin \
      --http-server-address=0.0.0.0:8888 \
      --access-control-allow-origin=* \
      --contracts-console \
      --verbose-http-errors`
    ],
    printOutput: true,
    portMappings: ["8888:8888", "8080:8889"]
  });
  await dock.setup();
  dock.loadExitHandler();
  await dock.start();
}