/**
 * `CreateLinkForm` \u2014 the entry-point of the Links feature.
 *
 * Spec contract (see `openspec/specs/links/spec.md` requirement #1
 * and the design \u00a77 feature shape):
 *  - Two fields: `original_url` (required, http(s)) and `slug`
 *    (optional, lowercased 3-20 chars, no leading/trailing hyphen).
 *  - Validates client-side via the shared `createLinkSchema`
 *    (RHF + `zodResolver`), so the BE can never see a payload
 *    that the FE itself rejected \u2014 no drift.
 *  - On submit, fires `useCreateLink`. The 409 detail
 *    ("Ese slug ya existe, prueba otro") is already on
 *    `err.detail` (see `apiClient` in `lib/api.ts`), so the
 *    Spanish toasting is a one-liner.
 *  - On success, toasts, resets the form, and copies the new
 *    `short_url` to the clipboard with a second toast. The
 *    "auto-copy on success" pattern matches the ux the spec
 *    describes in the create-link form.
 *  - The submit button is disabled and shows a spinner while the
 *    mutation is in flight (via the `Button` primitive's
 *    `loading` state).
 *
 * Why a controlled form and not uncontrolled: RHF's `register`
 * is naturally uncontrolled, but the loading flag is read from
 * the `useCreateLink` mutation hook (not from local state), and
 * RHF gives us `isSubmitting` for free. The combo of
 * `useForm` + `zodResolver` + the mutation hook is the minimum
 * boilerplate that keeps the field-error UX, the success toast,
 * and the clipboard copy in one place.
 */
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createLinkSchema, type CreateLinkInput } from '@shortpulse/shared';
import { toast } from 'sonner';

import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { ApiError } from '../../lib/api.js';
import { useCreateLink } from '../../hooks/use-links.js';
import { useCopyToClipboard } from '../../hooks/use-copy-to-clipboard.js';

type CreateLinkFormValues = CreateLinkInput;

export function CreateLinkForm(): React.JSX.Element {
  const mutation = useCreateLink();
  const { copy } = useCopyToClipboard();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
  } = useForm<CreateLinkFormValues>({
    resolver: zodResolver(createLinkSchema),
    defaultValues: { original_url: '', slug: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    // Normalize the empty slug to `undefined` so the BE's optional
    // regex isn't tripped by an empty string (RHF's zodResolver
    // passes through the empty value verbatim).
    const payload: CreateLinkInput = {
      original_url: values.original_url,
      ...(values.slug && values.slug.length > 0 ? { slug: values.slug } : {}),
    };
    try {
      const created = await mutation.mutateAsync(payload);
      toast.success('Link creado');
      // Auto-copy the short URL to the clipboard so the user can
      // paste it into the browser without an extra click.
      const ok = await copy(created.short_url);
      if (ok) {
        toast.success('URL copiada');
      }
      reset({ original_url: '', slug: '' });
      // Clear any prior mutation error so the field-level error
      // region disappears after a successful retry.
      mutation.reset();
    } catch (err) {
      if (err instanceof ApiError) {
        // 409 collision \u2014 the spec-locked Spanish string from the
        // BE's problem-details `detail`. We do NOT reset the form
        // here so the user can fix the slug in place.
        if (err.status === 409) {
          toast.error(err.detail ?? err.message);
          if (err.detail) {
            setError('slug', { type: 'server', message: err.detail });
          }
          return;
        }
        // 400 validation \u2014 surface the BE's detail on the slug
        // field if it looks like a slug issue, otherwise fall back
        // to a toast so the user sees SOMETHING.
        if (err.status === 400) {
          toast.error(err.detail ?? err.message);
          return;
        }
        toast.error(err.detail ?? err.message);
        return;
      }
      // Network / unknown \u2014 a generic message keeps the UX calm.
      toast.error('No se pudo crear el enlace');
    }
  });

  return (
    <form
      aria-labelledby="create-link-title"
      className="flex flex-col gap-4 rounded-lg border border-sp-border bg-sp-surface p-4 shadow-sm"
      onSubmit={onSubmit}
      noValidate
    >
      <header>
        <h2 id="create-link-title" className="text-base font-semibold text-sp-fg">
          Crear enlace
        </h2>
        <p className="mt-1 text-sm text-sp-fg-dim">
          Pega una URL y, si quieres, un slug personalizado.
        </p>
      </header>
      <Input
        label="URL original"
        type="url"
        placeholder="https://ejemplo.com"
        autoComplete="off"
        error={errors.original_url?.message}
        {...register('original_url')}
      />
      <Input
        label="Slug (opcional)"
        type="text"
        placeholder="mi-enlace"
        autoComplete="off"
        // `setValueAs` converts the empty string to `undefined` so
        // the BE's optional slug isn't sent as `slug=""` (which
        // would fail the regex on its own).
        {...register('slug', { setValueAs: (v) => (v === '' ? undefined : v) })}
        error={errors.slug?.message}
      />
      <div className="flex justify-end">
        <Button type="submit" loading={mutation.isPending}>
          {mutation.isPending ? 'Creando…' : 'Crear enlace'}
        </Button>
      </div>
    </form>
  );
}
