export function queueKeyedTask<T>(
  queues: Map<string, Promise<void>>,
  key: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const completion = next.then(() => undefined, () => undefined);

  queues.set(key, completion);
  void completion.then(() => {
    if (queues.get(key) === completion) queues.delete(key);
  });

  return next;
}
