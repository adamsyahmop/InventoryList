"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form-controls";
import type { ActionState } from "@/lib/action-utils";

const EMPTY_ACTION_STATE: ActionState = { ok: false };
import { loginAction } from "@/lib/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    EMPTY_ACTION_STATE,
  );
  const usernameError = state.fieldErrors?.username;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      {state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Field label="Username" htmlFor="username" error={usernameError} required>
        <Input
          id="username"
          name="username"
          type="text"
          autoFocus
          autoComplete="username"
          placeholder="mis. adam"
          invalid={Boolean(usernameError)}
        />
      </Field>

      <Field label="Password" htmlFor="password" error={passwordError} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          invalid={Boolean(passwordError)}
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Memproses…" : "Masuk"}
      </Button>
    </form>
  );
}
