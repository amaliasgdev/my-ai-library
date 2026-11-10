package com.mibiblioteca.bookservice.book.photoimport;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

class PhotoImportConfigurationTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(Config.class);

    @Configuration(proxyBeanMethods = false)
    @Import({PhotoRecognitionService.class, PhotoSanitizer.class, MockBookPhotoRecognitionProvider.class})
    static class Config { }

    @Test
    void defaultIsDisabledAndNoProviderOrInfrastructureIsCreated() {
        runner.run(context -> {
            assertThat(context).hasNotFailed().doesNotHaveBean(BookPhotoRecognitionProvider.class);
            var capabilities = context.getBean(PhotoRecognitionService.class).capabilities();
            assertThat(capabilities.enabled()).isFalse();
            assertThat(capabilities.provider()).isEqualTo("none");
            assertThat(capabilities.maxFileBytes()).isEqualTo(5242880);
            assertThat(context.getBeansOfType(javax.sql.DataSource.class)).isEmpty();
        });
    }

    @Test
    void mockRequiresProfileProviderAndExplicitEnablement() {
        for (String profile : new String[] {"dev", "test"}) {
            runner.withPropertyValues("spring.profiles.active=" + profile, "photo-import.enabled=true", "photo-import.provider=mock")
                .run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(BookPhotoRecognitionProvider.class);
                    assertThat(context.getBean(PhotoRecognitionService.class).capabilities().simulated()).isTrue();
                });
        }
        runner.withPropertyValues("spring.profiles.active=dev", "photo-import.provider=mock").run(context ->
            assertThat(context.getBean(PhotoRecognitionService.class).capabilities().enabled()).isFalse());
    }

    @Test
    void productionMixedAndMissingProfilesFailClosedWhenEnabled() {
        for (String profiles : new String[] {"prod", "production", "dev,prod", "test,staging", ""}) {
            runner.withPropertyValues("spring.profiles.active=" + profiles, "photo-import.enabled=true", "photo-import.provider=mock")
                .run(context -> assertThat(context).hasFailed());
        }
        runner.withPropertyValues("spring.profiles.active=dev", "photo-import.enabled=true", "photo-import.provider=external")
            .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void rejectsUnboundedOrInvalidConfiguredLimits() {
        for (String property : new String[] {"max-file-size=6MB", "max-width=6001", "max-height=0", "max-pixels=20000001",
            "max-observations=0", "max-concurrent-analyses=5", "analysis-timeout=0s", "analysis-timeout=61s"}) {
            runner.withPropertyValues("photo-import." + property).run(context -> assertThat(context).hasFailed());
        }
    }
}
