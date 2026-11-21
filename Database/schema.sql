-- PROJECT 2: Flooring Sales and Installation Management
-- MySQL 8.0.16+ (CHECK constraint enforcement), InnoDB, utf8mb4
-- Demo/educational database. Use simulated/tokenized payments only.
-- Run on a fresh database. This script does not delete existing tables.

CREATE DATABASE IF NOT EXISTS flooring_project2
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE flooring_project2;

-- 1. Clients
CREATE TABLE IF NOT EXISTS clients (
  client_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  address VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Anna / staff accounts
CREATE TABLE IF NOT EXISTS staff_accounts (
  staff_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL
) ENGINE=InnoDB;

-- 3. Tokenized or simulated card methods; NEVER store card number or CVV
CREATE TABLE IF NOT EXISTS payment_methods (
  method_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  payment_token VARCHAR(255) NOT NULL UNIQUE,
  card_brand VARCHAR(30),
  last_four CHAR(4),
  expiry_month TINYINT UNSIGNED,
  expiry_year SMALLINT UNSIGNED,
  CONSTRAINT fk_method_client FOREIGN KEY (client_id) REFERENCES clients(client_id),
  CONSTRAINT uq_method_client UNIQUE (method_id, client_id),
  CONSTRAINT chk_expiry_month CHECK (expiry_month IS NULL OR expiry_month BETWEEN 1 AND 12)
) ENGINE=InnoDB;

-- 4. Product catalog; prices are snapshotted into quote lines
CREATE TABLE IF NOT EXISTS flooring_products (
  product_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_name VARCHAR(150) NOT NULL,
  category VARCHAR(70) NOT NULL,
  brand VARCHAR(100),
  material_style VARCHAR(100),
  color VARCHAR(80),
  unit_price DECIMAL(12,2) NOT NULL,
  pricing_unit ENUM('SQFT','BOX','PIECE') NOT NULL,
  dimensions VARCHAR(100),
  sqft_per_package DECIMAL(12,3),
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_product_price CHECK (unit_price >= 0),
  CONSTRAINT chk_coverage CHECK (sqft_per_package IS NULL OR sqft_per_package > 0)
) ENGINE=InnoDB;

-- 5. Client requests
CREATE TABLE IF NOT EXISTS project_requests (
  project_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  service_address VARCHAR(255) NOT NULL,
  preferred_start DATE,
  preferred_end DATE,
  proposed_budget DECIMAL(12,2),
  total_area_sqft DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status ENUM('DRAFT','SUBMITTED','REJECTED','QUOTED','NEGOTIATING','ACCEPTED','CANCELED') NOT NULL DEFAULT 'DRAFT',
  rejection_reason TEXT,
  submitted_at DATETIME,
  CONSTRAINT fk_project_client FOREIGN KEY (client_id) REFERENCES clients(client_id),
  CONSTRAINT chk_project_budget CHECK (proposed_budget IS NULL OR proposed_budget >= 0),
  CONSTRAINT chk_project_area CHECK (total_area_sqft >= 0),
  CONSTRAINT chk_project_dates CHECK (preferred_end IS NULL OR preferred_start IS NULL OR preferred_end >= preferred_start)
) ENGINE=InnoDB;

-- 6. Project rooms; each room belongs to the project's selected product
CREATE TABLE IF NOT EXISTS project_rooms (
  room_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  room_name VARCHAR(100) NOT NULL,
  length_ft DECIMAL(10,2),
  width_ft DECIMAL(10,2),
  area_sqft DECIMAL(12,2) NOT NULL,
  existing_floor_type VARCHAR(100),
  removal_required BOOLEAN NOT NULL DEFAULT FALSE,
  installation_pattern VARCHAR(100),
  CONSTRAINT fk_room_project FOREIGN KEY (project_id) REFERENCES project_requests(project_id),
  CONSTRAINT fk_room_product FOREIGN KEY (product_id) REFERENCES flooring_products(product_id),
  CONSTRAINT uq_room_project UNIQUE (room_id, project_id),
  CONSTRAINT chk_room_length CHECK (length_ft IS NULL OR length_ft > 0),
  CONSTRAINT chk_room_width CHECK (width_ft IS NULL OR width_ft > 0),
  CONSTRAINT chk_room_area CHECK (area_sqft > 0)
) ENGINE=InnoDB;

-- 7. Project image metadata; app limits to five photos per project
CREATE TABLE IF NOT EXISTS project_photos (
  photo_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_photo_project FOREIGN KEY (project_id) REFERENCES project_requests(project_id)
) ENGINE=InnoDB;

-- 8. Quote versions; each version is a new row
CREATE TABLE IF NOT EXISTS quotes (
  quote_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  prepared_by BIGINT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  quoted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME,
  waste_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  estimated_material_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  estimated_labor_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  other_net_charges DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_price DECIMAL(12,2) NOT NULL,
  proposed_start DATETIME,
  proposed_end DATETIME,
  status ENUM('PROPOSED','COUNTERED','SUPERSEDED','ACCEPTED','REJECTED','CANCELED') NOT NULL DEFAULT 'PROPOSED',
  note TEXT,
  -- Only one accepted quote per project. MySQL UNIQUE permits multiple NULLs.
  accepted_project_id BIGINT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN status='ACCEPTED' THEN project_id ELSE NULL END) STORED,
  CONSTRAINT fk_quote_project FOREIGN KEY (project_id) REFERENCES project_requests(project_id),
  CONSTRAINT fk_quote_staff FOREIGN KEY (prepared_by) REFERENCES staff_accounts(staff_id),
  CONSTRAINT uq_quote_version UNIQUE (project_id, version_no),
  CONSTRAINT uq_quote_project_pair UNIQUE (quote_id, project_id),
  CONSTRAINT uq_one_accepted_quote UNIQUE (accepted_project_id),
  CONSTRAINT chk_quote_version CHECK (version_no >= 1),
  CONSTRAINT chk_quote_waste CHECK (waste_percent BETWEEN 0 AND 100),
  CONSTRAINT chk_quote_amounts CHECK (estimated_material_cost >= 0 AND estimated_labor_cost >= 0 AND total_price >= 0),
  CONSTRAINT chk_quote_dates CHECK (proposed_end IS NULL OR proposed_start IS NULL OR proposed_end >= proposed_start),
  CONSTRAINT chk_quote_acceptance CHECK ((status='ACCEPTED' AND accepted_at IS NOT NULL) OR (status<>'ACCEPTED' AND accepted_at IS NULL))
) ENGINE=InnoDB;

-- 9. Quote charges and material breakdown; no modification after publication
CREATE TABLE IF NOT EXISTS quote_lines (
  quote_line_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED,
  product_id BIGINT UNSIGNED,
  charge_type ENUM('MATERIAL','REMOVAL','LABOR','UNDERLAYMENT','TRIM','STAIRS','DELIVERY','OTHER','DISCOUNT') NOT NULL,
  description VARCHAR(255),
  quantity DECIMAL(12,3) NOT NULL,
  unit VARCHAR(30),
  unit_price DECIMAL(12,2) NOT NULL,
  line_amount DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_qline_quote_project FOREIGN KEY (quote_id, project_id) REFERENCES quotes(quote_id, project_id),
  CONSTRAINT fk_qline_room_project FOREIGN KEY (room_id, project_id) REFERENCES project_rooms(room_id, project_id),
  CONSTRAINT fk_qline_product FOREIGN KEY (product_id) REFERENCES flooring_products(product_id),
  CONSTRAINT chk_qline_qty CHECK (quantity >= 0),
  CONSTRAINT chk_qline_price CHECK (unit_price >= 0),
  CONSTRAINT chk_qline_amount CHECK ((charge_type='DISCOUNT' AND line_amount <= 0) OR (charge_type <> 'DISCOUNT' AND line_amount >= 0))
) ENGINE=InnoDB;

-- 10. Immutable message/event history for negotiations
CREATE TABLE IF NOT EXISTS negotiation_events (
  event_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  quote_id BIGINT UNSIGNED,
  sender_role ENUM('CLIENT','ANNA') NOT NULL,
  event_type ENUM('COUNTEROFFER','MESSAGE','ACCEPTANCE','REJECTION','CANCELLATION','RESPONSE') NOT NULL,
  message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ne_project FOREIGN KEY (project_id) REFERENCES project_requests(project_id),
  CONSTRAINT fk_ne_quote_project FOREIGN KEY (quote_id, project_id) REFERENCES quotes(quote_id, project_id)
) ENGINE=InnoDB;

-- 11. Exactly one order per project / accepted quote
CREATE TABLE IF NOT EXISTS installation_orders (
  order_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL UNIQUE,
  accepted_quote_id BIGINT UNSIGNED NOT NULL UNIQUE,
  service_address VARCHAR(255) NOT NULL,
  agreed_price DECIMAL(12,2) NOT NULL,
  scheduled_start DATETIME,
  scheduled_end DATETIME,
  actual_start DATETIME,
  completed_at DATETIME,
  status ENUM('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELED') NOT NULL DEFAULT 'SCHEDULED',
  completion_notes TEXT,
  CONSTRAINT fk_order_project FOREIGN KEY (project_id) REFERENCES project_requests(project_id),
  CONSTRAINT fk_order_quote_project FOREIGN KEY (accepted_quote_id, project_id) REFERENCES quotes(quote_id, project_id),
  CONSTRAINT uq_order_project_pair UNIQUE (order_id, project_id),
  CONSTRAINT chk_order_price CHECK (agreed_price >= 0),
  CONSTRAINT chk_order_schedule CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end >= scheduled_start),
  CONSTRAINT chk_order_completed CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL)
) ENGINE=InnoDB;

-- 12. Actual material and square footage separate, to support dashboard queries 5-7
CREATE TABLE IF NOT EXISTS installation_usage (
  usage_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  estimated_quantity DECIMAL(12,3) NOT NULL,
  actual_quantity DECIMAL(12,3),
  quantity_unit ENUM('SQFT','BOX','PIECE') NOT NULL,
  installed_area_sqft DECIMAL(12,2),
  estimated_unit_cost DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_usage_order_project FOREIGN KEY (order_id, project_id) REFERENCES installation_orders(order_id, project_id),
  CONSTRAINT fk_usage_room_project FOREIGN KEY (room_id, project_id) REFERENCES project_rooms(room_id, project_id),
  CONSTRAINT fk_usage_product FOREIGN KEY (product_id) REFERENCES flooring_products(product_id),
  CONSTRAINT chk_usage_est CHECK (estimated_quantity > 0),
  CONSTRAINT chk_usage_act CHECK (actual_quantity IS NULL OR actual_quantity >= 0),
  CONSTRAINT chk_usage_area CHECK (installed_area_sqft IS NULL OR installed_area_sqft >= 0),
  CONSTRAINT chk_usage_cost CHECK (estimated_unit_cost >= 0)
) ENGINE=InnoDB;

-- 13. A logical bill per order. History of revisions is separate.
CREATE TABLE IF NOT EXISTS bills (
  bill_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL UNIQUE,
  original_issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fully_paid_at DATETIME,
  status ENUM('ISSUED','DISPUTED','PAID') NOT NULL DEFAULT 'ISSUED',
  CONSTRAINT fk_bill_order FOREIGN KEY (order_id) REFERENCES installation_orders(order_id),
  CONSTRAINT chk_paid_time CHECK (fully_paid_at IS NULL OR fully_paid_at >= original_issued_at)
) ENGINE=InnoDB;

-- 14. Original bill is version 1; a revision inserts the next version
CREATE TABLE IF NOT EXISTS bill_revisions (
  revision_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_id BIGINT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_amount DECIMAL(12,2) NOT NULL,
  revision_reason TEXT,
  CONSTRAINT fk_revision_bill FOREIGN KEY (bill_id) REFERENCES bills(bill_id),
  CONSTRAINT uq_bill_version UNIQUE (bill_id, version_no),
  CONSTRAINT uq_revision_bill_pair UNIQUE (revision_id, bill_id),
  CONSTRAINT chk_bill_version CHECK (version_no >= 1),
  CONSTRAINT chk_bill_total CHECK (total_amount >= 0)
) ENGINE=InnoDB;

-- 15. Individual charges in each immutable bill revision
CREATE TABLE IF NOT EXISTS bill_lines (
  bill_line_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  revision_id BIGINT UNSIGNED NOT NULL,
  charge_type ENUM('MATERIAL','LABOR','REPAIR','UPGRADE','DELIVERY','OTHER','DISCOUNT','CREDIT') NOT NULL,
  description VARCHAR(255),
  quantity DECIMAL(12,3),
  unit_price DECIMAL(12,2),
  amount DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_billline_revision FOREIGN KEY (revision_id) REFERENCES bill_revisions(revision_id),
  CONSTRAINT chk_bill_line_qty CHECK (quantity IS NULL OR quantity >= 0),
  CONSTRAINT chk_bill_line_amount CHECK ((charge_type IN ('DISCOUNT','CREDIT') AND amount <= 0) OR (charge_type NOT IN ('DISCOUNT','CREDIT') AND amount >= 0))
) ENGINE=InnoDB;

-- 16. Bill disputes, responses and explanations are append-only events
CREATE TABLE IF NOT EXISTS bill_events (
  bill_event_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_id BIGINT UNSIGNED NOT NULL,
  revision_id BIGINT UNSIGNED,
  sender_role ENUM('CLIENT','ANNA') NOT NULL,
  event_type ENUM('DISPUTE','EXPLANATION','ADJUSTMENT','RESPONSE','RESOLUTION') NOT NULL,
  message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_be_bill FOREIGN KEY (bill_id) REFERENCES bills(bill_id),
  CONSTRAINT fk_be_revision_bill FOREIGN KEY (revision_id, bill_id) REFERENCES bill_revisions(revision_id, bill_id)
) ENGINE=InnoDB;

-- 17. Successful payments can be partial. Full-payment time is computed by app transaction.
CREATE TABLE IF NOT EXISTS payments (
  payment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_id BIGINT UNSIGNED NOT NULL,
  client_id BIGINT UNSIGNED NOT NULL,
  method_id BIGINT UNSIGNED,
  amount DECIMAL(12,2) NOT NULL,
  paid_at DATETIME,
  transaction_status ENUM('PENDING','SUCCEEDED','FAILED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  transaction_reference VARCHAR(120) UNIQUE,
  CONSTRAINT fk_payment_bill FOREIGN KEY (bill_id) REFERENCES bills(bill_id),
  CONSTRAINT fk_payment_client FOREIGN KEY (client_id) REFERENCES clients(client_id),
  CONSTRAINT fk_payment_method_owner FOREIGN KEY (method_id, client_id) REFERENCES payment_methods(method_id, client_id),
  CONSTRAINT chk_payment_amount CHECK (amount > 0),
  CONSTRAINT chk_payment_success_date CHECK (transaction_status <> 'SUCCEEDED' OR paid_at IS NOT NULL)
) ENGINE=InnoDB;

-- Supporting indexes for required dashboard reports
CREATE INDEX ix_project_client_status ON project_requests (client_id, status);
CREATE INDEX ix_quote_project_status ON quotes (project_id, status);
CREATE INDEX ix_quote_accepted ON quotes (accepted_at);
CREATE INDEX ix_order_status_completed ON installation_orders (status, completed_at);
CREATE INDEX ix_usage_product ON installation_usage (product_id);
CREATE INDEX ix_bill_status_issued ON bills (status, original_issued_at);
CREATE INDEX ix_payment_bill_status_time ON payments (bill_id, transaction_status, paid_at);

-- IMPORTANT IMPLEMENTATION RULES (enforce in backend transactions):
-- 1. A SUBMITTED project has >= 1 room and <= 5 photos; total_area_sqft = SUM(room.area_sqft).
-- 2. Only Anna can manage products, create quotes and finalize installation/billing.
-- 3. Quotes, quote_lines, negotiation_events, bill_revisions, bill_lines and bill_events
--    are historical snapshots: never UPDATE or DELETE published history.
-- 4. Validate quote.status='ACCEPTED' before creating its installation order.
--    Quotes and orders must belong to the same project (FK above ensures project match).
-- 5. Bill only a completed order; each issued bill has >=1 revision and >=1 bill line.
-- 6. Select current payable bill version by MAX(version_no), not by counting all versions.
-- 7. Validate payment bill ownership: bill -> order -> project -> client = payments.client_id.
-- 8. Calculate current balance using successful payments minus refunds; update status
--    and fully_paid_at atomically on a transaction when fully settled.
-- 9. Preserve immutable original_issued_at and historical settlement timing, including
--    after adjustments; define late-payment policy consistently for queries 8-10.
-- 10. Validate installation_usage product and room match the accepted/approved work;
--     compare equivalent quantity_unit values when computing 10% material overrun.
-- 11. For partial or refunded payments, do not treat first payment as full settlement.
-- 12. This script defines structure only; no sample clients or data are inserted.
