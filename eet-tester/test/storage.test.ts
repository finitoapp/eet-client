import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDefaultEndpointForm,
  createDefaultHeaderForm,
  createDefaultReceiptForm,
} from "../src/lib/defaults.ts";
import { loadPersistedState, savePersistedState } from "../src/lib/storage.ts";

function withStorage(storage: unknown, check: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    check();
  } finally {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", descriptor);
  }
}

const state = {
  receiptForm: createDefaultReceiptForm(),
  headerForm: createDefaultHeaderForm(),
  endpointForm: createDefaultEndpointForm(),
};

test("form state survives a storage round trip", () => {
  const values = new Map<string, string>();
  withStorage(
    {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
    () => {
      assert.equal(loadPersistedState(), undefined);
      assert.equal(savePersistedState(state).ok, true);
      assert.deepEqual(loadPersistedState(), state);
    },
  );
});

test("malformed and non-object JSON is ignored", () => {
  for (const raw of ["{", "null", "[]", "42", '"text"']) {
    withStorage({ getItem: () => raw }, () => {
      assert.equal(loadPersistedState(), undefined);
    });
  }
});

test("invalid sections fall back independently without losing valid sections", () => {
  for (const [section, form] of Object.entries(state)) {
    for (const field of Object.keys(form)) {
      const raw = JSON.stringify({ ...state, [section]: { ...form, [field]: null } });
      const expected = Object.fromEntries(Object.entries(state).filter(([key]) => key !== section));
      withStorage({ getItem: () => raw }, () => {
        assert.deepEqual(loadPersistedState(), expected);
      });
    }
  }
  for (const [section, field] of [
    ["headerForm", "uuidMode"],
    ["headerForm", "sentAtMode"],
    ["endpointForm", "kind"],
  ] as const) {
    const raw = JSON.stringify({ ...state, [section]: { ...state[section], [field]: "invalid" } });
    withStorage({ getItem: () => raw }, () => {
      assert.equal(Object.hasOwn(loadPersistedState() ?? {}, section), false);
    });
  }
});

test("unavailable storage and failed writes do not throw", () => {
  const failure = new Error("Storage is unavailable");
  withStorage(
    {
      getItem: () => {
        throw failure;
      },
      setItem: () => {
        throw failure;
      },
    },
    () => {
      assert.equal(loadPersistedState(), undefined);
      assert.deepEqual(savePersistedState(state), { ok: false, error: failure });
    },
  );
  withStorage(undefined, () => {
    assert.equal(loadPersistedState(), undefined);
    assert.equal(savePersistedState(state).ok, false);
  });
});
