const KEY = "bpmn-compartida.name";

export function getName(): string | null {
  return localStorage.getItem(KEY);
}
export function setName(name: string): void {
  localStorage.setItem(KEY, name);
}
export function clearName(): void {
  localStorage.removeItem(KEY);
}
