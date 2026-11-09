package com.mibiblioteca.bookservice.testsupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;

/** Read-only smoke checks. No application scan, auto-configuration or migrations. */
class IsolatedTestDatabaseConnectionTest {
    @Test
    void loadsTestResourcesAndVerifiesActualServerWithoutCreatingApplicationBeans() {
        try (var context = application().run()) {
            assertThat(context.getEnvironment().getProperty("spring.datasource.url"))
                .isEqualTo(IsolatedTestDatabaseInitializer.URL);
            assertThat(context.getEnvironment().getProperty("spring.datasource.username"))
                .isEqualTo(IsolatedTestDatabaseInitializer.USER);
            assertThat(context.getBeansOfType(DataSource.class)).isEmpty();
        }
    }

    @Test
    void originalDatasourceOverrideIsRejectedBeforeRefresh() {
        assertThatThrownBy(() -> application().run("--spring.datasource.url=jdbc:postgresql://localhost:5432/bookdb"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("spring.datasource.url");
    }

    private SpringApplicationBuilder application() {
        return new SpringApplicationBuilder(Probe.class)
            .web(WebApplicationType.NONE).logStartupInfo(false)
            .properties("spring.main.banner-mode=off", "logging.level.root=OFF");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Probe { }
}
