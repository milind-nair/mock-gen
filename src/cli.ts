import { Command } from 'commander';
import { loadConfig, coerceNumber } from './config.js';
import { startServer } from './server.js';

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
  .description('Record traffic from a real API (not yet implemented)')
  .action(() => {
    console.error('Record mode is not implemented yet.');
    process.exit(1);
  });

program
  .command('replay')
  .description('Replay recorded traffic (not yet implemented)')
  .action(() => {
    console.error('Replay mode is not implemented yet.');
    process.exit(1);
  });

program
  .command('generate-spec')
  .description('Generate a spec from a recording (not yet implemented)')
  .action(() => {
    console.error('Generate-spec mode is not implemented yet.');
    process.exit(1);
  });

program.parseAsync(process.argv);
