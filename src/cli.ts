import { Command } from 'commander';
import { loadConfig, coerceNumber } from './config.js';
import { startServer } from './server.js';
import { startRecordingServer } from './record.js';
import { startReplayServer } from './replay.js';
import { parseStatusList } from './recording.js';

const program = new Command();

program
  .name('mock-gen')
  .description('API Mock Server Generator');

program
  .command('start')
  .description('Start a mock server from an OpenAPI spec')
  .option('-s, --spec <path>', 'Path to OpenAPI spec (YAML or JSON)')
  .option('-p, --port <number>', 'Port to run the server on')
  .option('--host <host>', 'Host to bind the server to')
  .option('-c, --config <path>', 'Path to config file')
  .option('--watch', 'Watch spec file for changes')
  .option('--no-watch', 'Disable watching')
  .option('--stateful', 'Enable stateful mode')
  .option('--stateless', 'Disable stateful mode')
  .option('--seed <number>', 'Seed for deterministic data')
  .action(async (options) => {
    const overrides: any = {};

    if (options.spec) overrides.spec = options.spec;
    if (options.port) overrides.port = coerceNumber(options.port, undefined);
    if (options.host) overrides.host = options.host;
    if (options.watch !== undefined) overrides.watch = options.watch;
    if (options.stateful) overrides.stateful = true;
    if (options.stateless) overrides.stateful = false;
    if (options.seed) overrides.data = { seed: coerceNumber(options.seed, undefined) };

    const config = await loadConfig(options.config, overrides);
    await startServer(config);
  });

program
  .command('record')
  .description('Record traffic from a real API via a local proxy')
  .requiredOption('-t, --target <url>', 'Target API base URL')
  .option('-o, --output <path>', 'Output directory or file', 'recordings')
  .option('-p, --port <number>', 'Port to run the proxy on', '3003')
  .option('--host <host>', 'Host to bind to', '0.0.0.0')
  .option('--include <pattern>', 'Only record paths matching substring or /regex/')
  .option('--status <codes>', 'Only record responses with status codes (comma-separated)')
  .action(async (options) => {
    const statusFilter = parseStatusList(options.status);
    await startRecordingServer({
      target: options.target,
      output: options.output,
      host: options.host,
      port: coerceNumber(options.port, 3003) ?? 3003,
      include: options.include,
      statusFilter
    });
  });

program
  .command('replay')
  .description('Replay recorded traffic from a recording file')
  .requiredOption('-r, --recording <path>', 'Path to recording JSON file')
  .option('-p, --port <number>', 'Port to run the replay server on', '3004')
  .option('--host <host>', 'Host to bind to', '0.0.0.0')
  .option('--no-latency', 'Disable recorded latency playback')
  .option('--no-loop', 'Stop advancing after the last matching recording')
  .action(async (options) => {
    await startReplayServer({
      recording: options.recording,
      host: options.host,
      port: coerceNumber(options.port, 3004) ?? 3004,
      loop: options.loop,
      useLatency: options.latency
    });
  });

program
  .command('generate-spec')
  .description('Generate a spec from a recording (not yet implemented)')
  .action(() => {
    console.error('Generate-spec mode is not implemented yet.');
    process.exit(1);
  });

program.parseAsync(process.argv);
