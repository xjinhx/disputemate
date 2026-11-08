-- Reference data: dispute categories, routing rules and detection settings.
--
-- IMPORTANT: filing windows and reason codes below are PLACEHOLDER values for
-- the prototype. They must be confirmed against the bank's own card scheme
-- procedures and, for PayNow/FAST, the MAS E-Payments User Protection
-- Guidelines before any production use. Administrators can edit them in
-- /admin. Card disputes and e-payment disputes intentionally use separate rules.

insert into public.dispute_categories (key, label, description, sort_order) values
  ('unauthorised', 'Unauthorised transaction', 'I do not recognise or did not authorise this transaction.', 1),
  ('duplicate', 'Duplicate charge', 'I was charged more than once for the same purchase.', 2),
  ('goods_services', 'Goods or services issue', 'I paid by card but did not receive what I paid for, or it was not as described.', 3),
  ('failed_debited', 'Failed transfer, money debited', 'The transfer failed but money left my account.', 4),
  ('other', 'Other', 'Something else is wrong and needs a closer look.', 5)
on conflict (key) do nothing;

insert into public.routing_rules
  (name, payment_method, dispute_category, reason_code, procedure, review_queue, filing_window, filing_window_unit, required_fields, escalation_required)
values
  -- Card disputes (card scheme chargeback procedures)
  ('Card: unauthorised', 'card', 'unauthorised', 'CARD-FRAUD-01', 'card_chargeback', 'fraud', 120, 'days',
    array['customer_description', 'card_in_possession', 'shared_credentials'], true),
  ('Card: duplicate charge', 'card', 'duplicate', 'CARD-DUP-01', 'card_chargeback', 'disputes', 120, 'days',
    array['customer_description', 'related_transaction'], false),
  ('Card: goods or services', 'card', 'goods_services', 'CARD-GS-01', 'card_chargeback', 'disputes', 120, 'days',
    array['customer_description', 'merchant_contacted', 'evidence'], false),
  ('Card: other', 'card', 'other', 'CARD-OTH-01', 'manual_assessment', 'disputes', 120, 'days',
    array['customer_description'], true),
  -- E-payments (PayNow / FAST): Phase 2 in the PRD, rules present so routing is explicit
  ('PayNow: unauthorised', 'paynow', 'unauthorised', 'EPAY-UNAUTH-01', 'eupg_unauthorised', 'fraud', 30, 'days',
    array['customer_description', 'shared_credentials'], true),
  ('FAST: unauthorised', 'fast', 'unauthorised', 'EPAY-UNAUTH-01', 'eupg_unauthorised', 'fraud', 30, 'days',
    array['customer_description', 'shared_credentials'], true),
  ('FAST: failed but debited', 'fast', 'failed_debited', 'EPAY-FAIL-01', 'eupg_erroneous', 'disputes', 30, 'days',
    array['customer_description'], false),
  ('PayNow: failed but debited', 'paynow', 'failed_debited', 'EPAY-FAIL-01', 'eupg_erroneous', 'disputes', 30, 'days',
    array['customer_description'], false)
on conflict do nothing;

insert into public.system_settings (key, value) values
  ('duplicate_detection', '{"window_minutes": 30, "enabled": true}'::jsonb),
  ('failed_debit_detection', '{"enabled": true}'::jsonb),
  ('ai', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;
