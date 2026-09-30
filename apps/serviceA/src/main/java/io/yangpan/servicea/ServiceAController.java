package io.yangpan.servicea;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ServiceAController {

    @GetMapping("/")
    public Map<String, String> home() {
        return Map.of("ok", "true", "app", "serviceA");
    }
}
