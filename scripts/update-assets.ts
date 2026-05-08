import { spawn } from "node:child_process";

const commands = [
  ["npm", ["run", "scan"]],
  ["npm", ["run", "thumbs"]],
] as const;

for (const [command, args] of commands) {
  await run(command, args);
}

function run(command: string, args: readonly string[]) {
  return new Promise<void>((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const child = spawn(isWindows ? "cmd.exe" : command, isWindows ? ["/d", "/s", "/c", command, ...args] : args, {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}
