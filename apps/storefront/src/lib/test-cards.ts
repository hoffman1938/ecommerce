/**
 * Test card catalogue for the simulated payment page.
 *
 * The card number never leaves the browser and is never sent anywhere: the form
 * maps it to an outcome code locally and posts only that code. There is no
 * field in the sandbox that stores a PAN, and adding one would be the single
 * worst thing this project could do.
 *
 * Numbers are the well-known provider test values, which are reserved for
 * exactly this purpose and match no real account.
 */

export type PaymentOutcome =
  | 'TEST-SUCCESS'
  | 'TEST-DELAYED'
  | 'TEST-FAIL'
  | 'TEST-DECLINED'
  | 'TEST-INSUFFICIENT-FUNDS'
  | 'TEST-EXPIRED-CARD'
  | 'TEST-INVALID-CARD'
  | 'TEST-3DS-FAILED'
  | 'TEST-PROVIDER-UNAVAILABLE'
  | 'TEST-TIMEOUT'
  | 'TEST-CANCEL';

export interface TestCard {
  number: string;
  outcome: PaymentOutcome;
  label: string;
  description: string;
}

export const TEST_CARDS: TestCard[] = [
  {
    number: '4242424242424242',
    outcome: 'TEST-SUCCESS',
    label: 'Payment succeeds',
    description: 'Authorises immediately and confirms the order.',
  },
  {
    number: '4000000000000259',
    outcome: 'TEST-DELAYED',
    label: 'Delayed confirmation',
    description: 'Settles after about 10 seconds, like an async provider.',
  },
  {
    number: '4000000000000002',
    outcome: 'TEST-DECLINED',
    label: 'Card declined',
    description: 'Generic decline from the issuer.',
  },
  {
    number: '4000000000009995',
    outcome: 'TEST-INSUFFICIENT-FUNDS',
    label: 'Insufficient funds',
    description: 'The account does not have enough balance.',
  },
  {
    number: '4000000000000069',
    outcome: 'TEST-EXPIRED-CARD',
    label: 'Expired card',
    description: 'The issuer rejects the card as expired.',
  },
  {
    number: '4000000000003220',
    outcome: 'TEST-3DS-FAILED',
    label: '3-D Secure fails',
    description: 'Strong customer authentication is not completed.',
  },
  {
    number: '4000000000000119',
    outcome: 'TEST-PROVIDER-UNAVAILABLE',
    label: 'Provider unavailable',
    description: 'The payment provider returns a processing error.',
  },
  {
    number: '4000000000000127',
    outcome: 'TEST-TIMEOUT',
    label: 'Network timeout',
    description: 'No response from the provider before the request times out.',
  },
];

const BY_NUMBER = new Map(TEST_CARDS.map((card) => [card.number, card] as const));

export function normaliseCardNumber(input: string): string {
  return input.replace(/\D/g, '');
}

/** Groups digits in fours for display, without changing the value. */
export function formatCardNumber(input: string): string {
  return normaliseCardNumber(input)
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/** Luhn checksum — catches typos before we pretend to talk to a provider. */
export function passesLuhn(number: string): boolean {
  const digits = normaliseCardNumber(number);
  if (digits.length < 12) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

export interface CardFormValues {
  number: string;
  name: string;
  expiry: string;
  cvc: string;
}

export type CardValidation =
  | { ok: true; outcome: PaymentOutcome }
  | { ok: false; field: keyof CardFormValues; message: string };

/**
 * Validates the form the way a real gateway would, then resolves the outcome.
 *
 * A well-formed card that is not in the test list resolves to `TEST-INVALID-CARD`
 * rather than succeeding — a sandbox that approves arbitrary numbers teaches
 * testers the wrong thing about what the real integration will do.
 */
export function validateCard(values: CardFormValues): CardValidation {
  const number = normaliseCardNumber(values.number);

  if (number.length < 12) {
    return { ok: false, field: 'number', message: 'Enter the full 16-digit card number.' };
  }
  if (!passesLuhn(number)) {
    return { ok: false, field: 'number', message: 'That card number is not valid.' };
  }
  if (values.name.trim().length < 2) {
    return { ok: false, field: 'name', message: 'Enter the name printed on the card.' };
  }

  const expiryMatch = /^(\d{2})\s*\/\s*(\d{2})$/.exec(values.expiry.trim());
  if (!expiryMatch) {
    return { ok: false, field: 'expiry', message: 'Use MM/YY.' };
  }
  const month = Number(expiryMatch[1]);
  const year = 2000 + Number(expiryMatch[2]);
  if (month < 1 || month > 12) {
    return { ok: false, field: 'expiry', message: 'That month does not exist.' };
  }
  // Cards are valid through the last day of the printed month.
  const expiresAt = new Date(Date.UTC(year, month, 1));
  if (expiresAt.getTime() <= Date.now()) {
    return { ok: false, field: 'expiry', message: 'That card has expired.' };
  }

  if (!/^\d{3,4}$/.test(values.cvc.trim())) {
    return { ok: false, field: 'cvc', message: 'The security code is 3 or 4 digits.' };
  }

  const card = BY_NUMBER.get(number);
  return { ok: true, outcome: card?.outcome ?? 'TEST-INVALID-CARD' };
}

/** Customer-facing copy for a failed outcome. */
export const OUTCOME_MESSAGES: Record<string, string> = {
  'TEST-FAIL':
    'Your payment could not be completed. Please check your details or try another method.',
  'TEST-DECLINED':
    'Your payment was declined by your bank. Please check your details or try another payment method.',
  'TEST-INSUFFICIENT-FUNDS':
    'Your payment was declined for insufficient funds. Try another card or payment method.',
  'TEST-EXPIRED-CARD': 'That card has expired. Please use a different card.',
  'TEST-INVALID-CARD':
    'We could not process that card. Check the number, or use one of the test cards listed below.',
  'TEST-3DS-FAILED':
    'We could not verify you with your bank. Please try again or use another payment method.',
  'TEST-PROVIDER-UNAVAILABLE':
    'Our payment provider is temporarily unavailable. Please try again in a moment.',
  'TEST-TIMEOUT': 'The payment request timed out. Please try again.',
};
