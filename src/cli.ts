#!/usr/bin/env node
import { Command } from "commander";
import { runAddCommand } from "./commands/add.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runInitCommand } from "./commands/init.js";
import { runTransformCommand } from "./commands/transform.js";

const program = new Command();

program
  .name("shadcn-solid")
  .description("Wrap shadcn CLI and rewrite React Base UI output to Solid")
  .showHelpAfterError();

program
  .command("add")
  .allowUnknownOption(true)
  .argument("<names...>")
  .action(async (names, _options, command) => {
    await runAddCommand({
      cwd: process.cwd(),
      names: names as string[],
      forwardedArgs: command.args.slice((names as string[]).length),
    });
  });

program
  .command("init")
  .allowUnknownOption(true)
  .action(async (_options, command) => {
    await runInitCommand({
      cwd: process.cwd(),
      forwardedArgs: command.args,
    });
  });

program
  .command("transform")
  .option("-c, --config <path>", "Config path")
  .option("-y, --yes", "Skip confirmation prompt")
  .argument("[glob...]")
  .action(async (patterns, options) => {
    await runTransformCommand({
      cwd: process.cwd(),
      patterns: (patterns as string[] | undefined) ?? [],
      configPath: options.config as string | undefined,
      yes: Boolean(options.yes),
    });
  });

program
  .command("doctor")
  .option("-c, --config <path>", "Config path")
  .option("--write", "Insert TODO markers for findings")
  .argument("[glob...]")
  .action(async (patterns, options) => {
    await runDoctorCommand({
      cwd: process.cwd(),
      patterns: (patterns as string[] | undefined) ?? [],
      configPath: options.config as string | undefined,
      write: Boolean(options.write),
    });
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown shadcn-solid error");
  process.exitCode = 1;
});
