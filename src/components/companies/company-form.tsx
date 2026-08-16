"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  createCompanyAction,
  updateCompanyAction,
  updateCompanySettingsAction,
  type CompanyFormState,
} from "@/actions/companies";
import { useToast } from "@/components/ui/toast";
import { COMPANY_STATUSES, COMPANY_STATUS_LABELS } from "@/lib/constants";

export type CountryOption = {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
};

export type CompanyFormDefaults = {
  legalName: string;
  displayName: string;
  businessNumber: string;
  address: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  currency: string;
  contactEmail: string;
  contactPhone: string;
  status: "ACTIVE" | "ARCHIVED";
};

const emptyDefaults: CompanyFormDefaults = {
  legalName: "",
  displayName: "",
  businessNumber: "",
  address: "",
  city: "",
  stateProvince: "",
  postalCode: "",
  country: "",
  currency: "",
  contactEmail: "",
  contactPhone: "",
  status: "ACTIVE",
};

const initialState: CompanyFormState = {};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function CompanyForm({
  mode,
  companyId,
  countries,
  defaultValues,
  onCancelHref,
  variant = "page",
}: {
  mode: "create" | "edit";
  companyId?: string;
  countries: CountryOption[];
  defaultValues?: Partial<CompanyFormDefaults>;
  onCancelHref: string;
  /**
   * "page" (default): the dashboard Create/Edit Company pages — saving
   * redirects to the company's detail page (updateCompanyAction).
   * "settings": Company Settings → General tab — saving stays on the page
   * and shows a toast instead (updateCompanySettingsAction), since
   * Settings is a persistent workspace, not a one-shot form.
   */
  variant?: "page" | "settings";
}) {
  const isSettings = variant === "settings";
  const action =
    mode === "edit" && companyId
      ? (isSettings ? updateCompanySettingsAction : updateCompanyAction).bind(null, companyId)
      : createCompanyAction;
  const [state, formAction] = useFormState(action, initialState);
  const { toast } = useToast();

  // updateCompanySettingsAction doesn't redirect on success — it returns a
  // fresh `success` timestamp instead. Watch for that and surface it as a
  // toast, same pattern as CompanyStatusAction elsewhere in this module.
  const lastSuccessRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (isSettings && state?.success && state.success !== lastSuccessRef.current) {
      lastSuccessRef.current = state.success;
      toast("Company information saved.", "success");
    }
  }, [isSettings, state?.success, toast]);

  const values = { ...emptyDefaults, ...defaultValues };
  const fallbackCountry = countries[0];

  const [country, setCountry] = useState(values.country || fallbackCountry?.countryCode || "");
  const [currency, setCurrency] = useState(
    values.currency || fallbackCountry?.currencyCode || ""
  );

  // Auto-suggest the currency whenever the *user changes* the country.
  // Skipped on first mount so editing an existing company doesn't stomp on
  // a currency the user previously set manually.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const match = countries.find((c) => c.countryCode === country);
    if (match) setCurrency(match.currencyCode);
  }, [country, countries]);

  const selectedCountry = countries.find((c) => c.countryCode === country);

  return (
    <form action={formAction} className="max-w-2xl space-y-8">
      {state?.error ? (
        <div className="flex items-start gap-2 rounded border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-display text-sm font-semibold text-ink-900">Business information</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="legalName"
            label="Legal Business Name"
            required
            defaultValue={values.legalName}
            placeholder="Acme Holdings Inc."
            error={state?.fieldErrors?.legalName}
          />
          <Field
            id="displayName"
            label="Display Name"
            required
            defaultValue={values.displayName}
            placeholder="Acme"
            error={state?.fieldErrors?.displayName}
          />
        </div>

        <Field
          id="businessNumber"
          label="Business / Company Number"
          defaultValue={values.businessNumber}
          placeholder="e.g. 123456789 RC0001"
          error={state?.fieldErrors?.businessNumber}
        />

        <Field
          id="address"
          label="Address"
          defaultValue={values.address}
          placeholder="Street address"
          error={state?.fieldErrors?.address}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="city" label="City" defaultValue={values.city} error={state?.fieldErrors?.city} />
          <Field
            id="stateProvince"
            label="State / Province"
            defaultValue={values.stateProvince}
            error={state?.fieldErrors?.stateProvince}
          />
          <Field
            id="postalCode"
            label="Postal / ZIP Code"
            defaultValue={values.postalCode}
            error={state?.fieldErrors?.postalCode}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Select
              id="country"
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
            >
              {countries.map((c) => (
                <option key={c.countryCode} value={c.countryCode}>
                  {c.countryName}
                </option>
              ))}
            </Select>
            {state?.fieldErrors?.country ? (
              <p className="text-xs text-negative">{state.fieldErrors.country}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field
              id="contactEmail"
              label="Contact Email"
              type="email"
              defaultValue={values.contactEmail}
              placeholder="billing@acme.com"
              error={state?.fieldErrors?.contactEmail}
              className="col-span-2"
            />
          </div>
        </div>

        <Field
          id="contactPhone"
          label="Contact Phone"
          type="tel"
          defaultValue={values.contactPhone}
          placeholder="+1 (555) 000-0000"
          error={state?.fieldErrors?.contactPhone}
        />
      </section>

      <section className="space-y-4 border-t border-ink-100 pt-6">
        <h2 className="font-display text-sm font-semibold text-ink-900">Accounting basics</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <div className="flex items-center gap-2">
              {selectedCountry ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-ink-200 bg-surface-muted text-sm font-medium text-ink-600">
                  {selectedCountry.currencySymbol}
                </span>
              ) : null}
              <Input
                id="currency"
                name="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                required
                className="font-mono uppercase"
              />
            </div>
            <p className="text-xs text-ink-500">Auto-filled from country — change if needed.</p>
            {state?.fieldErrors?.currency ? (
              <p className="text-xs text-negative">{state.fieldErrors.currency}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={values.status} required>
              {COMPANY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COMPANY_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3 border-t border-ink-100 pt-6">
        <SubmitButton
          label={mode === "edit" ? "Save changes" : "Create company"}
          pendingLabel={mode === "edit" ? "Saving…" : "Creating…"}
        />
        <a href={onCancelHref} className="text-sm text-ink-500 hover:text-ink-800">
          Cancel
        </a>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  defaultValue,
  placeholder,
  required,
  type = "text",
  error,
  className,
}: {
  id: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  error?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-negative"> *</span> : null}
      </Label>
      <Input
        id={id}
        name={id}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
      />
      {error ? <p className="text-xs text-negative">{error}</p> : null}
    </div>
  );
}
