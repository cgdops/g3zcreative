import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Container, Typography, Grid, Paper } from '@mui/material';
import { styled } from '@mui/material/styles';

const ServiceCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  transition: 'transform 0.3s ease-in-out',
  '&:hover': {
    transform: 'translateY(-5px)'
  }
}));

const Services = () => {
  const services = [
    {
      title: 'Web Development',
      description: 'Custom websites built with modern technologies like React, focusing on performance, responsiveness, and user experience. We create solutions that help your business grow online.',
      features: [
        'Custom Website Development',
        'E-commerce Solutions',
        'Web Application Development',
        'Website Maintenance & Support'
      ]
    },
    {
      title: 'SEO Services',
      description: 'Comprehensive SEO strategies to improve your website\'s visibility in search engines and drive organic traffic to your business.',
      features: [
        'Keyword Research & Strategy',
        'On-Page SEO Optimization',
        'Technical SEO Audits',
        'Local SEO Services'
      ]
    },
    {
      title: 'Content Creation',
      description: 'Professional copywriting and content creation services that engage your audience and drive conversions.',
      features: [
        'Website Copy',
        'Blog Posts & Articles',
        'Email Marketing Content',
        'Social Media Content'
      ]
    },
    {
      title: 'Digital Marketing',
      description: 'Strategic digital marketing solutions to help you reach your target audience and achieve your business goals.',
      features: [
        'Social Media Marketing',
        'Email Marketing Campaigns',
        'PPC Advertising',
        'Marketing Analytics'
      ]
    }
  ];

  return (
    <Box sx={{ py: 8 }}>
      <Container maxWidth="lg">
        <Typography variant="h1" align="center" gutterBottom>
          Our Services
        </Typography>
        <Typography variant="h5" align="center" color="textSecondary" paragraph sx={{ mb: 8 }}>
          Comprehensive digital solutions to help your business thrive online
        </Typography>
        
        <Grid container spacing={4}>
          {services.map((service) => (
            <Grid item xs={12} md={6} key={service.title}>
              <ServiceCard elevation={2}>
                <Typography variant="h4" gutterBottom color="primary">
                  {service.title}
                </Typography>
                <Typography variant="body1" paragraph>
                  {service.description}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  {service.features.map((feature) => (
                    <Typography key={feature} variant="body2" sx={{ mb: 1 }}>
                      • {feature}
                    </Typography>
                  ))}
                </Box>
              </ServiceCard>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom>
            Ready to Grow Your Business?
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="large"
            component={RouterLink}
            to="/contact"
            sx={{ mt: 2 }}
          >
            Schedule a Free Consultation
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default Services;