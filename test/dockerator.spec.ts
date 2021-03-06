import { suite, test } from 'mocha-typescript'
import Dockerator from '../src/dockerator'

@suite
class DockeratorTests {
  @test public async runDockerfile() {
    const dock = new Dockerator({
      image: 'eosio-operator',
      command: ['cleos', '--help']
    })
    await dock.setup({ context: '../operator', src: ['Dockerfile'] })
    await dock.start({ untilExit: true })
  }

  @test public async runFalse() {
    const dock = new Dockerator({
      image: 'ubuntu:18.04',
      command: ['bash', '-c', 'echo "Some falsehood" && false']
    })
    await dock.setup()
    await dock.start({ untilExit: true })
  }

  @test public async runError() {
    const dock = new Dockerator({
      image: 'ubuntu:18.04',
      command: ['bash', '-c', 'cd some/non-existent/directory']
      // stdio: 'ignore'
    })
    await dock.setup()
    await dock.start({ untilExit: true })
  }

  @test public async runTrue() {
    const dock = new Dockerator({
      image: 'ubuntu:18.04',
      command: ['bash', '-c', 'echo "Some truth" && true']
    })
    await dock.setup()
    await dock.start({ untilExit: true })
  }

  @test public async runMongo() {
    const dock = new Dockerator({
      image: 'mongo:4.0.6',
      portMappings: ['27017:27017']
    })
    await dock.setup()
    dock.loadExitHandler()
    await dock.start()
  }

  @test public async runNodeos() {
    const dock = new Dockerator({
      image: 'eosio/eos-dev:v1.5.2',
      command: [
        'bash',
        '-c',
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
      portMappings: ['8888:8888', '8080:8889']
    })
    await dock.setup()
    dock.loadExitHandler()
    await dock.start()
  }
}
