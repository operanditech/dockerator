const Docker = require("dockerode");

class Dockerator {
  constructor({
    image,
    command,
    detach = false,
    portMappings = [],
    stdio = "inherit",
    dockerConfig = {}
  } = {}) {
    this.docker = new Docker();
    this.image = image;
    this.command = command;
    this.detach = detach;
    this.portMappings = portMappings.map(m =>
      Array.isArray(m) ? m : m.split(":")
    );
    if (detach) {
      this.stdio = "ignore";
    } else if (stdio === "inherit") {
      this.stdio = {
        stdout: global.process.stdout,
        stderr: global.process.stderr
      };
    } else {
      this.stdio = stdio;
    }
    this.dockerConfig = dockerConfig;
  }
  get canPrint() {
    return (
      this.stdio !== "ignore" && this.stdio.stdout && this.stdio.stdout.writable
    );
  }
  async setup() {
    try {
      await this.docker.getImage(this.image).inspect();
    } catch (error) {
      if (error.statusCode === 404) {
        if (this.canPrint) {
          this.stdio.stdout.write("Preparing docker image...\n");
        }
        const stream = await this.docker.pull(this.image);
        await new Promise((resolve, reject) => {
          this.docker.modem.followProgress(stream, (error, result) =>
            error ? reject(error) : resolve(result)
          );
        });
        if (this.canPrint) {
          this.stdio.stdout.write("Docker image ready\n");
        }
      } else {
        throw error;
      }
    }
  }
  async stop() {
    if (!this.container) {
      throw new Error("Cannot stop container before starting it");
    }
    await this.container.stop();
    await this.container.remove();
  }
  async start({ untilExit = false } = {}) {
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
    if (!this.detach) {
      const stream = await this.container.attach({
        stream: true,
        stdout: true,
        stderr: true
      });
      if (untilExit) {
        this.finished = new Promise((resolve, reject) => {
          stream.once("end", () => {
            this.container
              .inspect()
              .then(({ State }) => {
                if (State.Status === "exited" && State.ExitCode === 0) {
                  resolve();
                } else {
                  const error = new Error(State.Error);
                  error.exitCode = State.ExitCode;
                  reject(error);
                }
              })
              .catch(markError);
          });
  
          const checkerHandler = setInterval(async () => {
            const cInfo = await this.container.inspect();
            if(cInfo.State.Status == "running")
              return;
  
            if (cInfo.State.Status === "exited" && cInfo.State.ExitCode === 0) {
              resolve();
            } else {
              const error = new Error(cInfo.State.Error);
              error.exitCode = cInfo.State.ExitCode;
              reject(error);
            }

            clearInterval(checkerHandler);
          }, 1000)
        });
      }
      if (this.canPrint) {
        stream.setEncoding("utf8");
        stream.pipe(
          this.stdio.stdout,
          {
            end: true
          }
        );
      } else {
        stream.on("data", () => {});
      }
    }
    await this.container.start();
    if (untilExit) {
      return this.finished;
    }
  }
  loadExitHandler(process = global.process) {
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
