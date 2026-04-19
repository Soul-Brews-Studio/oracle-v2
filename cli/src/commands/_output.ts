export function emit(data: unknown, args: string[]): void {
  const yaml = args.includes("--yml") || args.includes("--yaml");
  if (yaml) {
    // @ts-expect-error Bun.YAML is available at runtime in Bun ≥1.1
    const out = Bun.YAML.stringify(data);
    process.stdout.write(out.endsWith("\n") ? out : out + "\n");
    return;
  }
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
