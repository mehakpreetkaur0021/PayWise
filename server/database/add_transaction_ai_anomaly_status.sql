-- Additive, rerunnable migration compatible with MySQL versions that do not
-- support ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
-- Existing columns and data are never changed or removed.

SET @add_ai_status_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE transactions ADD COLUMN ai_anomaly_status VARCHAR(20) NULL',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'transactions'
    AND column_name = 'ai_anomaly_status'
);
PREPARE add_ai_status_statement FROM @add_ai_status_sql;
EXECUTE add_ai_status_statement;
DEALLOCATE PREPARE add_ai_status_statement;

SET @add_ai_checked_at_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE transactions ADD COLUMN ai_anomaly_checked_at DATETIME NULL',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'transactions'
    AND column_name = 'ai_anomaly_checked_at'
);
PREPARE add_ai_checked_at_statement FROM @add_ai_checked_at_sql;
EXECUTE add_ai_checked_at_statement;
DEALLOCATE PREPARE add_ai_checked_at_statement;
