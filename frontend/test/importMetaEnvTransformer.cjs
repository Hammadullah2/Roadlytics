const ts = require("typescript");

const isImportMetaEnv = (node) => {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.expression.name.text === "meta" &&
    node.name.text === "env"
  );
};

const createProcessEnv = () => {
  return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("process"), "env");
};

module.exports = {
  name: "import-meta-env-transformer",
  version: 1,
  factory() {
    return (context) => {
      const visitor = (node) => {
        if (ts.isPropertyAccessExpression(node) && isImportMetaEnv(node.expression)) {
          return ts.factory.createPropertyAccessExpression(createProcessEnv(), node.name);
        }

        if (ts.isElementAccessExpression(node) && isImportMetaEnv(node.expression)) {
          return ts.factory.createElementAccessExpression(createProcessEnv(), node.argumentExpression);
        }

        if (isImportMetaEnv(node)) {
          return createProcessEnv();
        }

        return ts.visitEachChild(node, visitor, context);
      };

      return (sourceFile) => ts.visitNode(sourceFile, visitor);
    };
  },
};
