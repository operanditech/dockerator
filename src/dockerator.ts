import Docker from 'dockerode'
import { Readable, Writable } from 'stream'

export = class Dockerator {
  public docker: Docker
  public image: string
  public command?: string[]
  public detach: boolean
  public portMappings: Array<[string | number, string | number]>
  public stdio: { stdout?: Writable; stderr?: Writable }
  public dockerConfig: any
  public container?: Docker.Container
  public finished?: Promise<unknown>

  constructor({
    image,
    command,
    detach = false,
    portMappings = [],
    stdio = 'inherit',
    dockerConfig = {}
  }: {
    image: string
    command?: string[]
    detach?: boolean
    portMappings?: Array<string | [number | string, number | string]>
    stdio?: 'ignore' | 'inherit' | { stdout?: Writable; stderr?: Writable }
    dockerConfig?: any
  }) {
    this.docker = new Docker()
    this.image = image
    this.command = command
    this.detach = detach
    this.portMappings = portMappings.map(m =>
      Array.isArray(m) ? m : (m.split(':') as [string, string])
    )
    if (detach || stdio === 'ignore') {
      this.stdio = {}
    } else if (stdio === 'inherit') {
      this.stdio = {
        stdout: global.process.stdout,
        stderr: global.process.stderr
      }
    } else {
      this.stdio = stdio
    }
    this.dockerConfig = dockerConfig
  }

  public async setup(dockerfile?: { context: string; src: string[] }) {
    try {
      await this.docker.getImage(this.image).inspect()
    } catch (error) {
      if (error.statusCode === 404) {
        if (this.stdio.stdout && this.stdio.stdout.writable) {
          this.stdio.stdout.write('Preparing docker image...\n')
        }
        const stream = dockerfile
          ? await this.docker.buildImage(dockerfile, { t: this.image })
          : await this.docker.pull(this.image, {})
        await new Promise((resolve, reject) => {
          this.docker.modem.followProgress(
            stream,
            (error: Error, result: any) =>
              error ? reject(error) : resolve(result)
          )
        })
        if (this.stdio.stdout && this.stdio.stdout.writable) {
          this.stdio.stdout.write('Docker image ready\n')
        }
      } else {
        throw error
      }
    }
  }

  public async stop() {
    if (!this.container) {
      throw new Error('Cannot stop container before starting it')
    }
    try {
      await this.container.stop()
      await this.container.remove()
    } catch (e) {
      if (e.statusCode !== 409 && e.statusCode !== 304) {
        throw e
      }
    }
  }

  public async start({ untilExit = false } = {}) {
    this.container = await this.docker.createContainer({
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: false,
      StdinOnce: false,
      Image: this.image,
      ExposedPorts: this.portMappings.reduce(
        (result: { [port: string]: {} }, m) => {
          result[`${m[0]}/tcp`] = {}
          return result
        },
        {}
      ),
      HostConfig: {
        PortBindings: this.portMappings.reduce(
          (
            result: {
              [port: string]: Array<{ HostIp: '0.0.0.0'; HostPort: string }>
            },
            m
          ) => {
            result[`${m[0]}/tcp`] = [
              {
                HostIp: '0.0.0.0',
                HostPort: String(m[1])
              }
            ]
            return result
          },
          {}
        )
      },
      Cmd: this.command || undefined,
      ...this.dockerConfig
    })
    if (!this.detach) {
      const stream = ((await this.container.attach({
        stream: true,
        stdout: true,
        stderr: true
      })) as any) as Readable
      if (untilExit) {
        let markSuccess: () => void
        let markError: (error: any) => void
        this.finished = new Promise((resolve, reject) => {
          markSuccess = resolve
          markError = reject
        })
        const executionErrorMsg =
          'Execution error.' +
          (this.stdio.stdout && this.stdio.stdout.writable
            ? ''
            : ' If you need more details, enable container stdout.')
        if (process.platform !== 'win32') {
          stream.once('end', () => {
            this.container!.inspect()
              .then(({ State }) => {
                if (State.Status === 'exited' && State.ExitCode === 0) {
                  markSuccess()
                } else {
                  const error = new Error(State.Error || executionErrorMsg)
                  ;(error as any).exitCode = State.ExitCode
                  markError(error)
                }
              })
              .catch(markError)
          })
        } else {
          const checkerHandler = setInterval(() => {
            this.container!.inspect()
              .then(({ State }) => {
                if (State.Status === 'running') {
                  return
                }
                if (State.Status === 'exited' && State.ExitCode === 0) {
                  markSuccess()
                } else {
                  const error = new Error(State.Error || executionErrorMsg)
                  ;(error as any).exitCode = State.ExitCode
                  markError(error)
                }
                clearInterval(checkerHandler)
                stream.destroy()
              })
              .catch(error => {
                markError(error)
                clearInterval(checkerHandler)
                stream.destroy()
              })
          }, 1000)
        }
      }
      if (this.stdio.stdout && this.stdio.stdout.writable) {
        stream.setEncoding('utf8')
        stream.pipe(
          this.stdio.stdout,
          { end: true }
        )
      } else {
        stream.on('data', () => {
          // Discard data
        })
      }
    }
    await this.container.start()
    if (untilExit) {
      await this.finished
      await this.container.remove()
    }
  }

  public loadExitHandler(process = global.process) {
    const exitHandler = () => {
      this.stop().finally(() => {
        process.exit()
      })
    }
    process.on('SIGINT', exitHandler)
    process.on('SIGTERM', exitHandler)
  }
}
