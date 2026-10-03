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
