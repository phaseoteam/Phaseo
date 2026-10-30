"use client";

import { useCallback, useRef } from "react";

// Include unfinished, unnamed inputs as well as submitted fields. Read disabled
// controls too, so disabling a form during save does not change its fingerprint.
const snapshot = (form: HTMLFormElement) => JSON.stringify(Array.from(form.elements).flatMap((element) => {
  if (element instanceof HTMLInputElement) return [[element.tagName, element.type, element.name, element.value, element.checked]];
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return [[element.tagName, element.name, element.value]];
  return [];
}));

export function useCatalogFormChanges() {
  const form = useRef<HTMLFormElement | null>(null);
  const baseline = useRef<string | null>(null);
  const saved = useRef(false);
  const attach = useCallback((element: HTMLFormElement | null) => {
    form.current = element;
    if (element && baseline.current === null) baseline.current = snapshot(element);
  }, []);
  const isDirty = useCallback(() => !saved.current && form.current !== null && baseline.current !== null && snapshot(form.current) !== baseline.current, []);
  const markSaved = useCallback(() => {
    if (form.current) baseline.current = snapshot(form.current);
  }, []);
  const allowSavedNavigation = useCallback(() => { saved.current = true; }, []);
  return { attach, isDirty, markSaved, allowSavedNavigation };
}
