import { EetEndpoint, type ResponseSignatureVerifier } from "@finitoapp/eet-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionBar } from "@/components/ActionBar.tsx";
import { CertificateSection } from "@/components/CertificateSection.tsx";
import { CorsWarning } from "@/components/CorsWarning.tsx";
import { EndpointSection } from "@/components/EndpointSection.tsx";
import { RawXmlPanels } from "@/components/RawXmlPanels.tsx";
import { ReceiptForm } from "@/components/ReceiptForm.tsx";
import { ResultCard } from "@/components/ResultCard.tsx";
import { SubmissionSettingsSection } from "@/components/SubmissionSettingsSection.tsx";
import { VerifierSection } from "@/components/VerifierSection.tsx";
import { createInsecureAlwaysTrustVerifier, type LoadedSigner } from "@/lib/certificates.ts";
import {
  createDefaultEndpointForm,
  createDefaultHeaderForm,
  createDefaultReceiptForm,
  type EndpointFormState,
  type HeaderFormState,
  type ReceiptFormState,
} from "@/lib/defaults.ts";
import { previewUnsignedXml, type SubmitResult, submitReceipt } from "@/lib/eet.ts";
import { loadPersistedState, savePersistedState } from "@/lib/storage.ts";

interface AttemptDisplay {
  readonly result: SubmitResult | undefined;
  readonly insecureVerification: boolean;
  readonly requestXml: string | undefined;
  readonly responseXml: string | undefined;
}

export function App() {
  const [receiptForm, setReceiptForm] = useState<ReceiptFormState>(() => ({
    ...createDefaultReceiptForm(),
    ...loadPersistedState()?.receiptForm,
  }));
  const [headerForm, setHeaderForm] = useState<HeaderFormState>(() => ({
    ...createDefaultHeaderForm(),
    ...loadPersistedState()?.headerForm,
  }));
  const [endpointForm, setEndpointForm] = useState<EndpointFormState>(() => ({
    ...createDefaultEndpointForm(),
    ...loadPersistedState()?.endpointForm,
  }));

  useEffect(() => {
    savePersistedState({ receiptForm, headerForm, endpointForm });
  }, [receiptForm, headerForm, endpointForm]);

  const [signer, setSigner] = useState<LoadedSigner | undefined>(undefined);
  const [verifier, setVerifier] = useState<ResponseSignatureVerifier | undefined>(undefined);
  const [insecureVerification, setInsecureVerification] = useState(false);
  const insecureVerifier = useMemo(() => createInsecureAlwaysTrustVerifier(), []);

  const [submitting, setSubmitting] = useState(false);
  // Bundled into one atomic state, rather than separate `result`/`requestXml`/`responseXml`/
  // `insecureVerification` slices: each preview/submit fully replaces this together, so a result
  // on screen can never end up paired with XML or an insecure-mode flag from a different, earlier
  // attempt (or with the live `insecureVerification` toggle if it's changed since).
  const [attempt, setAttempt] = useState<AttemptDisplay | undefined>(undefined);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (attempt !== undefined)
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [attempt]);

  const canSubmit = signer !== undefined && verifier !== undefined && !submitting;

  const handlePreview = () => {
    const preview = previewUnsignedXml(receiptForm, headerForm);
    setAttempt(
      preview.kind === "xml"
        ? {
            result: undefined,
            insecureVerification: false,
            requestXml: preview.xml,
            responseXml: undefined,
          }
        : {
            result: preview,
            insecureVerification: false,
            requestXml: undefined,
            responseXml: undefined,
          },
    );
  };

  const handleSubmit = async () => {
    if (signer === undefined || verifier === undefined) return;
    setSubmitting(true);
    const timeoutMs = endpointForm.timeoutMs.trim() === "" ? NaN : Number(endpointForm.timeoutMs);
    const outcome = await submitReceipt({
      endpoint:
        endpointForm.kind === "playground" ? EetEndpoint.playground : endpointForm.customUrl,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      signer: signer.signer,
      responseSignatureVerifier: verifier,
      receiptForm,
      headerForm,
    });
    setSubmitting(false);
    setAttempt({
      result: outcome,
      insecureVerification,
      requestXml: "requestXml" in outcome ? outcome.requestXml : undefined,
      responseXml: "responseXml" in outcome ? outcome.responseXml : undefined,
    });
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">EET tester</h1>
        <p className="text-sm text-muted-foreground">
          Ruční vyzkoušení <code>@finitoapp/eet-client</code> v prohlížeči — nahrajte pokladní
          certifikát, vyplňte datovou zprávu a odešlete ji do EET playgroundu.
        </p>
      </header>

      <CorsWarning />

      <div className="grid gap-4 lg:grid-cols-2">
        <CertificateSection onSignerChange={setSigner} />

        <VerifierSection
          insecureVerifier={insecureVerifier}
          onVerifierChange={(nextVerifier, insecure) => {
            setVerifier(nextVerifier);
            setInsecureVerification(insecure);
          }}
        />
      </div>

      <EndpointSection value={endpointForm} onChange={setEndpointForm} />
      <ReceiptForm value={receiptForm} onChange={setReceiptForm} />
      <SubmissionSettingsSection value={headerForm} onChange={setHeaderForm} />

      <ActionBar
        signerReady={signer !== undefined}
        verifierReady={verifier !== undefined}
        submitting={submitting}
        canSubmit={canSubmit}
        onPreview={handlePreview}
        onSubmit={() => void handleSubmit()}
      />

      <div ref={resultRef} className="scroll-mt-4">
        <ResultCard
          result={attempt?.result}
          insecureVerification={attempt?.insecureVerification ?? false}
        />
      </div>
      <RawXmlPanels requestXml={attempt?.requestXml} responseXml={attempt?.responseXml} />
    </div>
  );
}
