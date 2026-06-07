const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
ssh.connect({
  host: '18.233.130.50',
  username: 'ubuntu',
  privateKeyPath: 'c:\\Users\\danil\\OneDrive\\Documentos\\GitHub\\ssh-oieate\\appcorekey.pem'
}).then(async () => {
  const commands = [
    "sudo apt-get update",
    "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server",
    "sudo systemctl enable mariadb",
    "sudo systemctl start mariadb",
    "sudo sed -i 's/bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mariadb.conf.d/50-server.cnf || true",
    "sudo sed -i 's/bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/my.cnf || true",
    "sudo systemctl restart mariadb",
    "sudo mysql -e \"CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY 'Senh@Forte123!';\"",
    "sudo mysql -e \"GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;\"",
    "sudo mysql -e \"ALTER USER 'root'@'%' IDENTIFIED BY 'Senh@Forte123!';\"",
    "sudo mysql -e \"FLUSH PRIVILEGES;\""
  ];
  for (const cmd of commands) {
    console.log('Running:', cmd);
    const result = await ssh.execCommand(cmd);
    console.log('STDOUT:', result.stdout);
    if (result.stderr) console.error('STDERR:', result.stderr);
  }
  ssh.dispose();
}).catch(console.error);
