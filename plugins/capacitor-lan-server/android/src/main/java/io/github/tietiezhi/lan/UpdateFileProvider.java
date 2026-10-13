package io.github.tietiezhi.lan;

/** 独立子类，避免与应用自带的 FileProvider 在清单合并时冲突 */
public class UpdateFileProvider extends androidx.core.content.FileProvider {}
