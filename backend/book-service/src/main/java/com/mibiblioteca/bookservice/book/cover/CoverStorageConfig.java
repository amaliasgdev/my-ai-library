package com.mibiblioteca.bookservice.book.cover;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(CoverStorageProperties.class)
public class CoverStorageConfig { }
