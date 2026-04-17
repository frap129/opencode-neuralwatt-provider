export function isQwenModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('qwen');
}

export function deriveName(id: string): string {
  const slashIndex = id.indexOf('/');
  return slashIndex >= 0 ? id.slice(slashIndex + 1) : id;
}
