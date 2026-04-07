import express from 'express';
import {
  ECONOMIC_TYPES,
  confirmMovementReview,
  deleteWorkspaceRule,
  getReviewQueue,
  getWorkspaceAudit,
  getWorkspaceOverview,
  getWorkspaceReports,
  getWorkspaceRules,
  updateImportedMovement,
} from '../workspace-utils.js';
import { handleRouteError, HttpError } from '../http.js';
import {
  CATEGORY_SET,
  PAYMENT_METHOD_SET,
  RECURRENCE_SET,
  parseBooleanFlag,
  parseEnum,
  parseIdParam,
  parseOptionalString,
} from '../validation.js';

const router = express.Router();
const ECONOMIC_TYPE_SET = new Set(ECONOMIC_TYPES);

router.get('/overview', (req, res) => {
  try {
    res.json(getWorkspaceOverview({ month: req.query.month, year: req.query.year }));
  } catch (error) {
    handleRouteError(res, error, 'Failed to build workspace overview');
  }
});

router.get('/reports', (req, res) => {
  try {
    res.json(getWorkspaceReports({
      month: req.query.month,
      year: req.query.year,
      period: req.query.period,
      analysisMode: req.query.analysis_mode,
      confidence: req.query.confidence,
      statementType: req.query.statement_type,
      category: req.query.category,
    }));
  } catch (error) {
    handleRouteError(res, error, 'Failed to build reports');
  }
});

router.get('/review-queue', (req, res) => {
  try {
    res.json(getReviewQueue());
  } catch (error) {
    handleRouteError(res, error, 'Failed to fetch review queue');
  }
});

router.get('/audit', (req, res) => {
  try {
    const filter = String(req.query.filter || 'all').trim();
    res.json(getWorkspaceAudit({ filter }));
  } catch (error) {
    handleRouteError(res, error, 'Failed to build audit trail');
  }
});

router.put('/review/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const economicType = parseEnum('economic_type', req.body?.economic_type, ECONOMIC_TYPE_SET);
    const saveRule = parseBooleanFlag(req.body?.save_rule ?? 1, 'save_rule');
    const category = req.body?.category
      ? parseEnum('category', req.body.category, CATEGORY_SET)
      : '';

    const result = confirmMovementReview(id, {
      economicType,
      category,
      saveRule: Boolean(saveRule),
    });

    res.json(result);
  } catch (error) {
    if (error.message === 'Movement not found') {
      return handleRouteError(res, new HttpError(404, error.message), 'Movement not found');
    }
    return handleRouteError(res, error, 'Failed to confirm review item');
  }
});

router.put('/movements/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const economicType = parseEnum('economic_type', req.body?.economic_type, ECONOMIC_TYPE_SET);
    const saveRule = parseBooleanFlag(req.body?.save_rule ?? 1, 'save_rule');
    const applyToMatches = parseBooleanFlag(req.body?.apply_to_matches ?? 1, 'apply_to_matches');
    const category = req.body?.category
      ? parseEnum('category', req.body.category, CATEGORY_SET)
      : '';
    const paymentMethod = req.body?.payment_method
      ? parseEnum('payment_method', req.body.payment_method, PAYMENT_METHOD_SET)
      : '';
    const recurrence = req.body?.recurrence
      ? parseEnum('recurrence', req.body.recurrence, RECURRENCE_SET)
      : '';
    const counterparty = parseOptionalString(req.body?.counterparty, { max: 160 });
    const merchant = parseOptionalString(req.body?.merchant, { max: 160 });

    const result = updateImportedMovement(id, {
      economicType,
      category,
      paymentMethod,
      recurrence,
      counterparty,
      merchant,
      applyToMatches: Boolean(applyToMatches),
      saveRule: Boolean(saveRule),
    });

    res.json(result);
  } catch (error) {
    if (error.message === 'Movement not found') {
      return handleRouteError(res, new HttpError(404, error.message), 'Movement not found');
    }
    return handleRouteError(res, error, 'Failed to update imported movement');
  }
});

router.get('/rules', (req, res) => {
  try {
    res.json(getWorkspaceRules());
  } catch (error) {
    handleRouteError(res, error, 'Failed to load rules');
  }
});

router.delete('/rules/:kind/:id', (req, res) => {
  try {
    const kind = String(req.params.kind || '').trim();
    if (!['import', 'economic'].includes(kind)) {
      throw new HttpError(400, 'Rule kind is invalid');
    }

    const id = parseIdParam(req.params.id, 'id');
    const deleted = deleteWorkspaceRule(kind, id);
    if (deleted === 0) {
      throw new HttpError(404, 'Rule not found');
    }

    res.json({ deleted });
  } catch (error) {
    handleRouteError(res, error, 'Failed to delete rule');
  }
});

export default router;
