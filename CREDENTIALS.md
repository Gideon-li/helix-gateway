# Helix 登录信息（私有，请勿公开仓库）

## 控制台账号

登录页 **不能自行注册**，也没有 Google / X。账号由超级管理员开通。

| 邮箱 | 角色 | 密码 |
| --- | --- | --- |
| `524347725@qq.com` | 超级管理员 | 用「忘记密码」设置 / 重置 |
| `divination558@foxmail.com` | 管理员 | `destiny1986` |

超级管理员可在 **账号** 页开通其他人、改权限、停用、设置密码。

找回密码的邮件从 `524347725@qq.com` 发出。

## Helix API 密钥

在控制台 **控制台 → 新建密钥**。完整密钥形如：

```
sk-hx-********************************
```

只在创建弹窗里出现一次，请立刻复制到你的应用环境变量 `HELIX_API_KEY`。

业务应用调用：

```
Authorization: Bearer sk-hx-...
Base URL（HTTP · IP）: http://<服务器IP>/v1
Base URL（HTTP · 域名）: http://<你的域名>/v1
两者同时有效，应用里填任意一个。
model: qwen3.8-flash
```

## 上游（Qwen）

Qwen Token Plan 的公司密钥请只填在 Helix 控制台「上游」页，**不要提交到 Git**。

- Base URL: `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
- 模型: `qwen3.8-flash`
