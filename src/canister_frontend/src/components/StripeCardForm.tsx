import { Button } from "@/components/ui/button";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

interface StripeCardFormProps {
  clientSecret: string | null;
  disabled?: boolean;
  onPaymentSubmitted: () => void;
  onPaymentError: (message: string) => void;
}

function StripeCardFormInner({
  disabled = false,
  onPaymentSubmitted,
  onPaymentError,
}: Omit<StripeCardFormProps, "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) {
      return;
    }

    setIsSubmitting(true);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });
    setIsSubmitting(false);

    if (result.error) {
      onPaymentError(result.error.message ?? "Payment failed.");
      return;
    }

    onPaymentSubmitted();
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <PaymentElement />
      <Button type="submit" disabled={disabled || !stripe || !elements || isSubmitting}>
        {isSubmitting ? "Processing..." : "Pay now"}
      </Button>
    </form>
  );
}

export default function StripeCardForm({
  clientSecret,
  disabled = false,
  onPaymentSubmitted,
  onPaymentError,
}: StripeCardFormProps) {
  const options = clientSecret
    ? { clientSecret, appearance: { theme: "night" as const } }
    : undefined;

  if (!publishableKey || !stripePromise) {
    return (
      <p className="text-xs text-amber">
        Stripe publishable key is missing. Set `VITE_STRIPE_PUBLISHABLE_KEY`.
      </p>
    );
  }

  if (!clientSecret || !options) {
    return (
      <p className="text-xs text-muted-foreground">
        Initializing secure card form...
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <StripeCardFormInner
        disabled={disabled}
        onPaymentSubmitted={onPaymentSubmitted}
        onPaymentError={onPaymentError}
      />
    </Elements>
  );
}
