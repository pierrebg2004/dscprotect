#!/bin/bash

echo "🔄 Initialisation de la mise à jour Node.js..."

# 1. Vérifier si NVM est installé, sinon l'installer
if [ -z "$NVM_DIR" ]; then
  echo "📥 Installation de NVM..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# 2. Recharger NVM pour être sûr
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 3. Installer la dernière version de Node (v25)
echo "🚀 Installation de Node.js v25..."
nvm install 25

# 4. Mettre cette version par défaut
nvm alias default 25
nvm use 25

echo "✅ Terminé !"
echo "Version actuelle :"
node -v
echo "⚠️  Redémarrez votre terminal ou votre bot pour que ce soit pris en compte."
