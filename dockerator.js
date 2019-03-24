const Docker = require("dockerode");

class Dockerator {
  constructor({
    image,
    command,
    printOutput = false,
    portMappings = [],
    dockerConfig = {}
  } = {}) {
    this.docker = new Docker();
    this.image = image;
    this.command = command;
    this.printOutput = printOutput;
    this.portMappings = portMappings.map(m =>
      Array.isArray(m) ? m : m.split(":")
    );
    this.dockerConfig = dockerConfig;
  }
  async setup() {
    if (this.printOutput) {
      console.log("Preparing docker image...");
    }
    const stream = await this.docker.pull(this.image);
    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (error, result) =>
        error ? reject(error) : resolve(result)
      );
    });
    if (this.printOutput) {
      console.log("Docker image ready");
    }
  }
  async stop() {
    if (!this.container) {
      throw new Error("Cannot stop container before starting it");
    }
    await this.container.stop();
    await this.container.remove();
  }
  async start() {
    this.container = await this.docker.createContainer({
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: false,
      StdinOnce: false,
      Image: this.image,
      ExposedPorts: this.portMappings.reduce((result, m) => {
        result[`${m[0]}/tcp`] = {};
        return result;
      }, {}),
      HostConfig: {
        PortBindings: this.portMappings.reduce((result, m) => {
          result[`${m[0]}/tcp`] = [
            {
              HostIp: "0.0.0.0",
              HostPort: String(m[1])
            }
          ];
          return result;
        }, {})
      },
      Cmd: this.command || undefined,
      ...this.dockerConfig
    });
    if (this.printOutput) {
      const stream = await this.container.attach({
        stream: true,
        stdout: true,
        stderr: true
      });
      stream.setEncoding("utf8");
      stream.pipe(
        process.stdout,
        {
          end: true
        }
      );
    }
    await this.container.start();
  }
  loadExitHandler(process = process) {
    const exitHandler = () => {
      this.stop().finally(() => {
        process.exit();
      });
    };
    process.on("SIGINT", exitHandler);
    process.on("SIGTERM", exitHandler);
  }
}

module.exports = Dockerator;
