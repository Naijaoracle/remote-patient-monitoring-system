/* This is a sql interpretation of the data being stored.*/

CREATE TABLE PeripheralDevice (
  id INT PRIMARY KEY AUTO_INCREMENT,
  public_key VARCHAR(255) NOT NULL,
  private_key VARCHAR(255) NOT NULL
);

CREATE TABLE CentralDevice (
  id INT PRIMARY KEY AUTO_INCREMENT,
  public_key VARCHAR(255) NOT NULL,
  private_key VARCHAR(255) NOT NULL
);

CREATE TABLE Measurement (
  id INT PRIMARY KEY AUTO_INCREMENT,
  peripheral_device_id INT,
  central_device_id INT,
  timestamp DATETIME,
  measurement_value VARCHAR(255),
  peripheral_device_signature VARCHAR(255),
  central_device_receive_time DATETIME,
  central_device_signature VARCHAR(255),
  transaction_id INT,
  FOREIGN KEY (peripheral_device_id) REFERENCES PeripheralDevice(id),
  FOREIGN KEY (central_device_id) REFERENCES CentralDevice(id),
  FOREIGN KEY (transaction_id) REFERENCES Transaction(id)
);

CREATE TABLE Transaction (
  id INT PRIMARY KEY AUTO_INCREMENT,
  validator_id INT,
  validity_criteria VARCHAR(255),
  is_valid BOOLEAN,
  block_id INT,
  FOREIGN KEY (validator_id) REFERENCES Validator(id),
  FOREIGN KEY (block_id) REFERENCES Block(id)
);

CREATE TABLE Block (
  id INT PRIMARY KEY AUTO_INCREMENT,
  block_hash VARCHAR(255),
  previous_block_hash VARCHAR(255)
);

CREATE TABLE Validator (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255),
  reputation_score INT
);

