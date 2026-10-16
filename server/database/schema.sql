CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'student',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  balance BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_wallet_balance_nonnegative CHECK (balance >= 0),
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('DEPOSIT', 'TRANSFER') NOT NULL,
  sender_wallet_id INT NULL,
  receiver_wallet_id INT NOT NULL,
  amount BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  suspicious BOOLEAN NOT NULL DEFAULT FALSE,
  suspicious_reason VARCHAR(255) NULL,
  ai_anomaly_status VARCHAR(20) NULL,
  ai_anomaly_checked_at DATETIME NULL,
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_transaction_amount_positive CHECK (amount > 0),
  CONSTRAINT fk_transaction_sender FOREIGN KEY (sender_wallet_id) REFERENCES wallets(id),
  CONSTRAINT fk_transaction_receiver FOREIGN KEY (receiver_wallet_id) REFERENCES wallets(id),
  INDEX idx_transactions_sender_created (sender_wallet_id, created_at),
  INDEX idx_transactions_receiver_created (receiver_wallet_id, created_at),
  INDEX idx_transactions_suspicion_checks (sender_wallet_id, type, status, created_at)
);

CREATE TABLE IF NOT EXISTS user_security (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  pin_hash VARCHAR(255) NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_security_user FOREIGN KEY (user_id) REFERENCES users(id)
);
