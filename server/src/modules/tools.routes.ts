import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { ah } from '../middleware/error.js';
import { emi } from '../utils/emi.js';

export const toolsRouter = Router();

/** Public EMI calculator (mirrors the app's Fare screen, incl. indicative range). */
toolsRouter.post('/emi',
  validate(z.object({ amount: z.number().int().positive(), tenureMonths: z.number().int().positive(), rate: z.number().positive() })),
  ah(async (req, res) => {
    const { amount, tenureMonths, rate } = req.body;
    const e = emi(amount, tenureMonths, rate);
    const payable = e * tenureMonths;
    const interest = payable - amount;
    const rng = (v: number, lo: number, hi: number) => ({ low: Math.round(v * lo), high: Math.round(v * hi) });
    res.json({
      emi: e,
      totalPayable: payable,
      totalInterest: interest,
      range: { emi: rng(e, 0.92, 1.08), interest: rng(interest, 0.85, 1.15), payable: rng(payable, 0.95, 1.05) },
    });
  }));
