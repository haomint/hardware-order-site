import { LoginSchema } from "../../shared/index.ts";
import { setAdministrator } from "../src/auth.ts";
import { databasePath } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";

const input = LoginSchema.safeParse({
  username: process.env.ADMIN_USERNAME,
  password: process.env.ADMIN_PASSWORD,
});
if (!input.success) {
  console.error("请在命令环境中设置有效的 ADMIN_USERNAME 和 ADMIN_PASSWORD。");
  process.exitCode = 1;
} else {
  const db = openDatabase(databasePath());
  try {
    await setAdministrator(db, input.data);
    console.log("管理员账号已设置，旧会话已注销。");
  } finally {
    db.close();
  }
}
