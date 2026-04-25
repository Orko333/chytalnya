/**
 * PaymentModal — reusable fake Stripe checkout modal.
 *
 * Usage:
 *   <PaymentModal
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     checkoutUrl="/api/payments/platform/checkout"   // GET → CheckoutInit
 *     confirmUrl="/api/payments/platform/confirm"     // POST + card → PaymentOut
 *     onSuccess={() => { ... invalidate queries etc. }}
 *   />
 *
 * For author subs, pass the author-specific URLs.
 */

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { CheckoutInit, PaymentItem } from "@/api/types";
import { X, CreditCard, Lock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** POST endpoint that initialises checkout (returns CheckoutInit) */
  checkoutUrl: string;
  /** POST endpoint that confirms payment (body: ConfirmIn → PaymentOut) */
  confirmUrl: string;
  onSuccess?: (payment: PaymentItem) => void;
}

// ── Luhn validation (client-side) ─────────────────────────────────────────────
function luhn(card: string): boolean {
  const digits = card.replace(/\D/g, "");
  if (digits.length < 13) return false;
  let sum = 0;
  [...digits].reverse().forEach((ch, i) => {
    let d = parseInt(ch, 10);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  });
  return sum % 10 === 0;
}

function validExpiry(val: string): boolean {
  const m = val.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = parseInt(m[1], 10);
  const year = parseInt(m[2], 10) + 2000;
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const exp = new Date(year, month, 1); // first day of next month after expiry
  return exp > now;
}

// ── Card number formatter ─────────────────────────────────────────────────────
function fmtCard(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

// ── Expiry formatter ──────────────────────────────────────────────────────────
function fmtExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits;
}

type Stage = "idle" | "loading" | "form" | "processing" | "success" | "error";

export default function PaymentModal({ open, onClose, checkoutUrl, confirmUrl, onSuccess }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [init, setInit] = useState<CheckoutInit | null>(null);
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [holder, setHolder] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");
  const [successData, setSuccessData] = useState<PaymentItem | null>(null);
  const cardRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStage("loading");
      setCard(""); setExpiry(""); setCvv(""); setHolder("");
      setErrors({}); setApiError(""); setSuccessData(null);
    } else {
      setStage("idle");
    }
  }, [open]);

  // Fetch checkout init when loading
  useEffect(() => {
    if (stage !== "loading" || !init) {
      if (stage === "loading") {
        api.post<CheckoutInit>(checkoutUrl).then((r) => {
          setInit(r.data);
          setStage("form");
          setTimeout(() => cardRef.current?.focus(), 100);
        }).catch((e) => {
          setApiError(e?.response?.data?.detail || "Помилка ініціалізації платежу");
          setStage("error");
        });
      }
    }
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = useMutation({
    mutationFn: async () => {
      if (!init) throw new Error("No init");
      return (await api.post<PaymentItem>(confirmUrl, {
        payment_id: init.payment_id,
        card_number: card,
        expiry,
        cvv,
        cardholder: holder,
      })).data;
    },
    onSuccess: (data) => {
      setSuccessData(data);
      setStage("success");
      onSuccess?.(data);
    },
    onError: (e: any) => {
      setApiError(e?.response?.data?.detail || "Помилка оплати. Перевірте дані картки.");
      setStage("form");
    },
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    const digits = card.replace(/\D/g, "");
    if (!luhn(digits)) errs.card = "Невірний номер картки";
    if (!validExpiry(expiry)) errs.expiry = "Невірний або прострочений термін";
    if (!/^\d{3,4}$/.test(cvv)) errs.cvv = "CVV — 3 або 4 цифри";
    if (holder.trim().length < 2) errs.holder = "Введіть ім'я власника";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    setApiError("");
    setStage("processing");
    confirm.mutate();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-white"/>
            </div>
            <span className="font-semibold text-lg">Оплата</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="p-5">
          {/* Loading */}
          {stage === "loading" && (
            <div className="flex flex-col items-center py-10 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500"/>
              <span className="text-sm">Ініціалізація…</span>
            </div>
          )}

          {/* Error */}
          {stage === "error" && (
            <div className="flex flex-col items-center py-8 gap-4">
              <AlertCircle className="w-12 h-12 text-red-500"/>
              <p className="text-center text-sm text-slate-300">{apiError}</p>
              <button className="btn-ghost text-sm" onClick={onClose}>Закрити</button>
            </div>
          )}

          {/* Success */}
          {stage === "success" && successData && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-400"/>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-green-400 mb-1">Оплачено!</div>
                <div className="text-sm text-slate-400">{successData.description}</div>
                <div className="text-xs text-slate-500 mt-1">
                  ****{successData.card_last4} · ${successData.amount.toFixed(2)} {successData.currency}
                </div>
              </div>
              <button className="btn-primary w-full" onClick={onClose}>Продовжити</button>
            </div>
          )}

          {/* Form */}
          {(stage === "form" || stage === "processing") && init && (
            <>
              {/* Amount summary */}
              <div className="bg-surface-800 rounded-xl p-3 mb-5 flex items-center justify-between">
                <span className="text-sm text-slate-400">{init.description}</span>
                <span className="font-bold text-brand-400">${init.amount.toFixed(2)}</span>
              </div>

              {/* Test card hint */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4 text-xs text-amber-300 space-y-0.5">
                <div className="font-semibold mb-1">Тестові картки:</div>
                <div>✅ 4242 4242 4242 4242 — успіх</div>
                <div>❌ 4000 0000 0000 0002 — відхилено (нема коштів)</div>
                <div>❌ 4000 0000 0000 0069 — відхилено банком</div>
                <div className="text-slate-400 mt-1">Будь-який термін у майбутньому, будь-який CVV</div>
              </div>

              {/* Card number */}
              <div className="mb-3">
                <label className="text-xs text-slate-400 mb-1 block">Номер картки</label>
                <div className="relative">
                  <input
                    ref={cardRef}
                    className={`input pr-10 font-mono tracking-widest ${errors.card ? "border-red-500" : ""}`}
                    placeholder="0000 0000 0000 0000"
                    value={card}
                    maxLength={19}
                    onChange={(e) => setCard(fmtCard(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    disabled={stage === "processing"}
                  />
                  <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                </div>
                {errors.card && <div className="text-xs text-red-400 mt-1">{errors.card}</div>}
              </div>

              {/* Expiry + CVV */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Термін дії</label>
                  <input
                    className={`input font-mono ${errors.expiry ? "border-red-500" : ""}`}
                    placeholder="MM/YY"
                    value={expiry}
                    maxLength={5}
                    onChange={(e) => setExpiry(fmtExpiry(e.target.value))}
                    disabled={stage === "processing"}
                  />
                  {errors.expiry && <div className="text-xs text-red-400 mt-1">{errors.expiry}</div>}
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">CVV</label>
                  <input
                    className={`input font-mono ${errors.cvv ? "border-red-500" : ""}`}
                    placeholder="123"
                    type="password"
                    value={cvv}
                    maxLength={4}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    disabled={stage === "processing"}
                  />
                  {errors.cvv && <div className="text-xs text-red-400 mt-1">{errors.cvv}</div>}
                </div>
              </div>

              {/* Cardholder */}
              <div className="mb-4">
                <label className="text-xs text-slate-400 mb-1 block">Ім'я власника</label>
                <input
                  className={`input uppercase ${errors.holder ? "border-red-500" : ""}`}
                  placeholder="IVAN PETRENKO"
                  value={holder}
                  onChange={(e) => setHolder(e.target.value.toUpperCase())}
                  disabled={stage === "processing"}
                />
                {errors.holder && <div className="text-xs text-red-400 mt-1">{errors.holder}</div>}
              </div>

              {/* API error */}
              {apiError && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5"/>
                  <span className="text-sm text-red-300">{apiError}</span>
                </div>
              )}

              {/* Submit */}
              <button
                className="btn-primary w-full flex items-center justify-center gap-2"
                onClick={handleSubmit}
                disabled={stage === "processing"}
              >
                {stage === "processing" ? (
                  <><Loader2 className="w-4 h-4 animate-spin"/>Обробка…</>
                ) : (
                  <><Lock className="w-4 h-4"/>Сплатити ${init.amount.toFixed(2)}</>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-slate-500">
                <Lock className="w-3 h-3"/>
                <span>Захищено 256-bit шифруванням · Powered by Stripe</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
