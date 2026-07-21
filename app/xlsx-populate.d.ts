declare module "xlsx-populate/browser/xlsx-populate.js" {
  const XlsxPopulate: {
    fromBlankAsync(): Promise<any>;
    fromDataAsync(data: unknown, options?: { password?: string }): Promise<any>;
  };
  export default XlsxPopulate;
}
