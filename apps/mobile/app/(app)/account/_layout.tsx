import { SplitStack } from "@/components/shell/SplitStack";
import { AccountMenu } from "@/features/account/AccountMenu";

export const unstable_settings = { anchor: "index" };

export default function AccountLayout() {
  return <SplitStack list={<AccountMenu />} />;
}
