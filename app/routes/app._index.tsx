import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  List,
  Link,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <Page>
      <TitleBar title="Mobile Plan Onboarding" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Checkout extensions
                </Text>
                <Text as="p" variant="bodyMd">
                  This app provides checkout UI extensions for mobile plan
                  onboarding. Customers can port their existing number or choose
                  a new Swiss mobile number during checkout.
                </Text>
                <Text as="p" variant="bodyMd">
                  To configure the checkout blocks, go to{" "}
                  <Link url="shopify:admin/settings/checkout" removeUnderline>
                    Settings &rarr; Checkout &rarr; Customize
                  </Link>{" "}
                  and add the <strong>Mobile Plan Onboarding</strong> app block.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Setup checklist
                  </Text>
                  <List>
                    <List.Item>
                      Enable <strong>Storefront API</strong> access on the{" "}
                      <code>custom.monthly_price</code> metafield definition
                    </List.Item>
                    <List.Item>
                      Publish mobile plan products to the{" "}
                      <strong>Online Store</strong> sales channel
                    </List.Item>
                    <List.Item>
                      Set product type to{" "}
                      <code>Mobile-subscription</code> on plan products
                    </List.Item>
                    <List.Item>
                      Add the checkout block in{" "}
                      <strong>Customize checkout</strong>
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Stack
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Framework
                      </Text>
                      <Link
                        url="https://remix.run"
                        target="_blank"
                        removeUnderline
                      >
                        Remix
                      </Link>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Database
                      </Text>
                      <Link
                        url="https://www.prisma.io/"
                        target="_blank"
                        removeUnderline
                      >
                        Prisma / SQLite
                      </Link>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        UI
                      </Text>
                      <Link
                        url="https://polaris.shopify.com"
                        target="_blank"
                        removeUnderline
                      >
                        Polaris
                      </Link>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
