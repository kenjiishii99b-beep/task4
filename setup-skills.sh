#!/usr/bin/env bash
set -e

echo "============================================================"
echo " Claude Code スキル＆プラグイン セットアップスクリプト"
echo "============================================================"
echo ""

# 1. 事前準備（Claude Code の更新）
echo "[1/3] Claude Code を最新版に更新します..."
if command -v claude &> /dev/null; then
    claude update || echo "※ claude update をスキップしました。"
else
    echo "警告: claude コマンドが見つかりません。Claude Code がインストールされているか確認してください。"
fi
echo ""

# 2. ターミナルでインストール可能な Agent Skills の導入
echo "[2/3] Agent Skills (npx skills) をインストールします..."
echo "※ 対話画面が表示された場合は、以下を目安に選択してください："
echo "   - スキル選択: Ctrl + A（全選択） -> Enter"
echo "   - エージェント選択: 変更せずそのまま Enter"
echo "   - 保存先(スコープ): フレームワーク特化は Project / 汎用は Global"
echo ""

echo ">> NestJS スキル (amirtaherkhani/nestjs-skills) のインストール..."
npx -y skills add amirtaherkhani/nestjs-skills

echo ""
echo ">> FastAPI スキル (fastapi-clean-architecture) のインストール..."
npx -y skills add rafaelkamimura/claude-tools --skill fastapi-clean-architecture -a claude-code

echo ""
echo ">> 汎用スキル (anthropics/skills) のインストール..."
npx -y skills add anthropics/skills

echo ""
echo ">> Frontend Design スキル (frontend-design) のインストール..."
npx -y skills add anthropics/skills --skill frontend-design -a claude-code

echo ""
echo "============================================================"
echo " ターミナルでのスキル導入が完了しました！"
echo "============================================================"
echo ""

# 3. Claude Code チャット欄で実行するプラグインの案内
echo "[3/3] 次のステップ：Claude Code を起動してプラグインを導入してください"
echo "ターミナルで 'claude' を実行後、チャット欄に以下のコマンドを1行ずつ入力します："
echo "(スコープ選択画面では 'Install for you (user scope)' を選択)"
echo ""
echo "  /plugin marketplace add microsoft/azure-skills"
echo "  /plugin install azure@azure-skills"
echo "  /plugin install superpowers@claude-plugins-official"
echo "  /plugin marketplace add anthropics/skills"
echo "  /plugin install document-skills@anthropic-agent-skills"
echo "  /plugin install code-review@claude-plugins-official"
echo ""
echo "※ Azure 連携を行う場合は、事前に 'az login' を実行してください。"
echo "※ すべて完了後、Claude Code を再起動 (/exit -> claude) して /skills と /plugin で確認できます。"
