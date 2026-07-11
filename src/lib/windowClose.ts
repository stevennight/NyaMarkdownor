export type WindowCloseOperations = {
  persistRecovery: () => Promise<void>;
  approveClose: () => void;
  destroy: () => Promise<void>;
  close: () => Promise<void>;
};

export type WindowCloseResult = {
  recoveryError: unknown | null;
  destroyError: unknown | null;
  usedCloseFallback: boolean;
};

export function shouldBlockBrowserUnload(desktopRuntime: boolean, dirtyDocumentCount: number): boolean {
  return !desktopRuntime && dirtyDocumentCount > 0;
}

export async function closeWindowAfterRecovery(operations: WindowCloseOperations): Promise<WindowCloseResult> {
  let recoveryError: unknown | null = null;

  try {
    await operations.persistRecovery();
  } catch (error) {
    recoveryError = error;
  }

  operations.approveClose();

  try {
    await operations.destroy();
    return { recoveryError, destroyError: null, usedCloseFallback: false };
  } catch (destroyError) {
    await operations.close();
    return { recoveryError, destroyError, usedCloseFallback: true };
  }
}
