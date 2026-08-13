export function pack(edit = [], read = [], truncated = null) {
  return { edit: [...edit], read: [...read], truncated };
}
