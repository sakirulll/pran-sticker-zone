CREATE TABLE IF NOT EXISTS pos_users (
  id CHAR(36) NOT NULL,
  email VARCHAR(254) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY pos_users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_shops (
  id CHAR(36) NOT NULL,
  owner_user_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY pos_shops_owner_unique (owner_user_id),
  CONSTRAINT pos_shops_owner_fk FOREIGN KEY (owner_user_id) REFERENCES pos_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_shop_members (
  shop_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role_id BIGINT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_id, user_id),
  UNIQUE KEY pos_members_user_unique (user_id),
  CONSTRAINT pos_members_shop_fk FOREIGN KEY (shop_id) REFERENCES pos_shops (id) ON DELETE CASCADE,
  CONSTRAINT pos_members_user_fk FOREIGN KEY (user_id) REFERENCES pos_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_shop_data (
  shop_id CHAR(36) NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_id),
  CONSTRAINT pos_data_shop_fk FOREIGN KEY (shop_id) REFERENCES pos_shops (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY pos_login_attempts_email (email, attempted_at),
  KEY pos_login_attempts_ip (ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_shop_sync (
  shop_id CHAR(36) NOT NULL,
  rev BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id),
  CONSTRAINT pos_sync_shop_fk FOREIGN KEY (shop_id) REFERENCES pos_shops (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_records (
  shop_id CHAR(36) NOT NULL,
  collection VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  record_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  pos DOUBLE NOT NULL DEFAULT 0,
  payload MEDIUMTEXT NOT NULL,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  rev BIGINT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_id, collection, record_id),
  KEY pos_records_rev (shop_id, rev),
  CONSTRAINT pos_records_shop_fk FOREIGN KEY (shop_id) REFERENCES pos_shops (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_meta (
  name VARCHAR(60) NOT NULL,
  value VARCHAR(255) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_password_resets (
  token_hash CHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  PRIMARY KEY (token_hash),
  KEY pos_resets_user (user_id, created_at),
  CONSTRAINT pos_resets_user_fk FOREIGN KEY (user_id) REFERENCES pos_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_subscriptions (
  shop_id CHAR(36) NOT NULL,
  paid_until DATETIME NULL,
  suspended TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_id),
  CONSTRAINT pos_subscriptions_shop_fk FOREIGN KEY (shop_id) REFERENCES pos_shops (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_id CHAR(36) NOT NULL,
  plan VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(20) NOT NULL,
  sender VARCHAR(30) NOT NULL,
  trx_id VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  note VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY pos_payments_trx_unique (trx_id),
  KEY pos_payments_shop (shop_id),
  KEY pos_payments_status (status),
  CONSTRAINT pos_payments_shop_fk FOREIGN KEY (shop_id) REFERENCES pos_shops (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_admins (
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT pos_admins_user_fk FOREIGN KEY (user_id) REFERENCES pos_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_email_verifications (
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  last_sent_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  PRIMARY KEY (user_id),
  KEY pos_verifications_token (token_hash),
  CONSTRAINT pos_verifications_user_fk FOREIGN KEY (user_id) REFERENCES pos_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
